"""
End-to-End and Integration Tests for Foundry Tabletop Hub Backend
Tests WebSocket synchronization, RPC round-trips, SQLite action logging, and REST state endpoints.
"""

import asyncio
import json
import os
import threading
import time
import pytest
import uvicorn
import httpx
import websockets

from database import init_db
from connection_manager import manager
from main import app

TEST_HOST = "127.0.0.1"
TEST_PORT = 8999
BASE_URL = f"http://{TEST_HOST}:{TEST_PORT}"
WS_URL = f"ws://{TEST_HOST}:{TEST_PORT}"

@pytest.fixture(scope="session")
def live_server(tmp_path_factory):
    """Spawns an actual Uvicorn server in a background thread for clean network testing."""
    tmp_dir = tmp_path_factory.mktemp("hub_test_db")
    test_db = str(tmp_dir / "test_hub.db")
    os.environ["HUB_DB_PATH"] = test_db
    manager.db_path = test_db

    config = uvicorn.Config(app, host=TEST_HOST, port=TEST_PORT, log_level="error")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for server to become responsive
    started = False
    for _ in range(50):
        try:
            with httpx.Client() as client:
                r = client.get(f"{BASE_URL}/api/health", timeout=1.0)
                if r.status_code == 200:
                    started = True
                    break
        except Exception:
            time.sleep(0.05)

    if not started:
        raise RuntimeError("Test server failed to start.")

    yield {"base_url": BASE_URL, "ws_url": WS_URL, "db_path": test_db}

    server.should_exit = True
    thread.join(timeout=3)

@pytest.mark.asyncio
async def test_health_endpoint(live_server):
    async with httpx.AsyncClient(base_url=live_server["base_url"]) as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_mock_foundry_full_lifecycle(live_server):
    """
    Connects a simulated Foundry GM client over WebSocket,
    verifies Initial Sync, Action Logging to SQLite, and RPC round-trips.
    """
    foundry_ws_endpoint = f"{live_server['ws_url']}/ws/foundry"

    async with websockets.connect(foundry_ws_endpoint) as ws:
        # 1. Verify health shows Foundry connected
        async with httpx.AsyncClient(base_url=live_server["base_url"]) as client:
            health_resp = await client.get("/api/health")
            assert health_resp.json()["foundryConnected"] is True

            # 2. Mock Foundry sends INITIAL_SYNC
            initial_sync_data = {
                "type": "INITIAL_SYNC",
                "timestamp": int(time.time() * 1000),
                "data": {
                    "actors": [
                        {
                            "id": "actor-shadowheart",
                            "name": "Shadowheart",
                            "type": "character",
                            "hasPlayerOwner": True,
                            "system": {
                                "attributes": {"hp": {"value": 32, "max": 32}, "ac": {"value": 18}},
                                "abilities": {"wis": {"value": 17, "mod": 3}}
                            },
                            "items": [
                                {"id": "item-mace", "name": "Mace", "type": "weapon", "system": {}}
                            ]
                        }
                    ],
                    "partyInventory": {
                        "id": "actor-party-chest",
                        "name": "Party Inventory",
                        "type": "npc",
                        "items": [
                            {"id": "item-potion", "name": "Potion of Healing", "type": "consumable", "system": {"quantity": 4}}
                        ]
                    },
                    "journals": [
                        {
                            "id": "journal-shared",
                            "name": "Party Shared Notes",
                            "pages": [
                                {"id": "page-quest", "name": "Find the Cure", "content": "# Quest Line\\nInvestigate the tadpole."}
                            ]
                        }
                    ],
                    "activeScene": {
                        "id": "scene-camp",
                        "name": "Wilderness Camp",
                        "width": 4000,
                        "height": 3000
                    }
                }
            }
            await ws.send(json.dumps(initial_sync_data))
            await asyncio.sleep(0.1)

            # Verify /api/state reflects synced world
            state_resp = await client.get("/api/state")
            assert state_resp.status_code == 200
            state = state_resp.json()
            assert state["isFoundryConnected"] is True
            assert len(state["actors"]) == 1
            assert state["actors"][0]["name"] == "Shadowheart"
            assert state["partyInventory"]["name"] == "Party Inventory"
            assert len(state["journals"]) == 1
            assert state["activeScene"]["name"] == "Wilderness Camp"

            # 3. Mock Foundry emits ACTION_LOGGED with critical hit roll
            action_log_msg = {
                "type": "ACTION_LOGGED",
                "id": "chat-crit-999",
                "timestamp": int(time.time() * 1000),
                "user": "Player",
                "speaker": "Shadowheart",
                "actorId": "actor-shadowheart",
                "flavor": "Guiding Bolt Attack",
                "content": "Shadowheart casts Guiding Bolt!",
                "isRoll": True,
                "whisper": [],
                "rolls": [
                    {
                        "formula": "1d20 + 5",
                        "total": 25,
                        "isCritical": True,
                        "isFumble": False,
                        "dice": [
                            {"faces": 20, "results": [{"result": 20, "active": True}]}
                        ]
                    }
                ]
            }
            await ws.send(json.dumps(action_log_msg))
            await asyncio.sleep(0.1)

            # Verify SQLite persistence via /api/state
            state_after_log = await client.get("/api/state")
            logs = state_after_log.json()["actionLogs"]
            assert len(logs) >= 1
            crit_log = next((l for l in logs if l.get("id") == "chat-crit-999"), None)
            assert crit_log is not None
            assert crit_log["speaker"] == "Shadowheart"
            assert crit_log["rolls"][0]["isCritical"] is True

            # 4. RPC Round-trip (USE_ITEM)
            # Setup background listener on mock Foundry to reply to RPC
            async def reply_to_use_item():
                raw = await ws.recv()
                req = json.loads(raw)
                assert req["action"] == "USE_ITEM"
                assert req["params"]["itemId"] == "item-mace"
                reply = {
                    "type": "RPC_RESPONSE",
                    "requestId": req["requestId"],
                    "result": {
                        "success": True,
                        "actorId": req["params"]["actorId"],
                        "itemId": req["params"]["itemId"],
                        "itemName": "Mace",
                        "result": "Executed"
                    },
                    "error": None
                }
                await ws.send(json.dumps(reply))

            listener_task = asyncio.create_task(reply_to_use_item())

            cmd_resp = await client.post("/api/command", json={
                "action": "USE_ITEM",
                "params": {"actorId": "actor-shadowheart", "itemId": "item-mace"}
            })
            await listener_task

            assert cmd_resp.status_code == 200
            cmd_data = cmd_resp.json()
            assert cmd_data["success"] is True
            assert cmd_data["result"]["itemName"] == "Mace"

            # 5. RPC Round-trip (TRANSFER_ITEM) + Ledger verification
            async def reply_to_transfer():
                raw = await ws.recv()
                req = json.loads(raw)
                assert req["action"] == "TRANSFER_ITEM"
                reply = {
                    "type": "RPC_RESPONSE",
                    "requestId": req["requestId"],
                    "result": {
                        "success": True,
                        "sourceActor": "Shadowheart",
                        "targetActor": "Party Inventory",
                        "itemName": "Mace",
                        "transferredQuantity": 1
                    },
                    "error": None
                }
                await ws.send(json.dumps(reply))

            transfer_task = asyncio.create_task(reply_to_transfer())

            transfer_resp = await client.post("/api/command", json={
                "action": "TRANSFER_ITEM",
                "params": {
                    "sourceActorId": "actor-shadowheart",
                    "targetActorId": "actor-party-chest",
                    "itemId": "item-mace",
                    "quantity": 1
                }
            })
            await transfer_task

            assert transfer_resp.status_code == 200
            t_data = transfer_resp.json()
            assert t_data["success"] is True

            # Verify SQLite item_ledger
            ledger_resp = await client.get("/api/ledger")
            assert ledger_resp.status_code == 200
            ledger = ledger_resp.json()["ledger"]
            assert len(ledger) >= 1
            entry = next((e for e in ledger if e.get("item_name") == "Mace"), None)
            assert entry is not None
            assert entry["source_actor"] == "Shadowheart"
            assert entry["target_actor"] == "Party Inventory"
            assert entry["quantity"] == 1
