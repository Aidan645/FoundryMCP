"""
Connection Manager for Foundry GM Socket and Player Web UI Sockets
Handles bidirectional RPC routing, event persistence, and real-time broadcasting.
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

from database import (
    DEFAULT_DB_PATH,
    insert_action_log,
    set_world_cache,
    get_world_cache
)

logger = logging.getLogger("foundry-hub.connection_manager")
logger.setLevel(logging.INFO)

class ConnectionManager:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self.foundry_ws: Optional[WebSocket] = None
        self.client_sockets: Set[WebSocket] = set()
        self.pending_rpcs: Dict[str, asyncio.Future] = {}

        # Cached world state
        self.actors: List[Dict[str, Any]] = []
        self.party_inventory: Optional[Dict[str, Any]] = None
        self.journals: List[Dict[str, Any]] = []
        self.active_scene: Optional[Dict[str, Any]] = None

    @property
    def is_foundry_connected(self) -> bool:
        return self.foundry_ws is not None

    async def connect_foundry(self, websocket: WebSocket) -> None:
        await websocket.accept()
        if self.foundry_ws and self.foundry_ws != websocket:
            logger.warning("Secondary Foundry GM WebSocket connected. Closing previous socket to enforce single-leader.")
            try:
                await self.foundry_ws.close()
            except Exception:
                pass
        self.foundry_ws = websocket
        logger.info("Foundry GM Bridge WebSocket connected.")
        await self.broadcast_to_clients({
            "type": "FOUNDRY_STATUS",
            "connected": True,
            "timestamp": int(time.time() * 1000)
        })

    async def disconnect_foundry(self, websocket: WebSocket) -> None:
        if self.foundry_ws == websocket:
            self.foundry_ws = None
            logger.warning("Foundry GM Bridge WebSocket disconnected.")
            # Fail any in-flight RPCs
            for req_id, future in list(self.pending_rpcs.items()):
                if not future.done():
                    future.set_exception(ConnectionError("Foundry Bridge disconnected while waiting for RPC response."))
            self.pending_rpcs.clear()

            await self.broadcast_to_clients({
                "type": "FOUNDRY_STATUS",
                "connected": False,
                "timestamp": int(time.time() * 1000)
            })

    async def connect_client(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.client_sockets.add(websocket)
        logger.info(f"Client UI connected. Total clients: {len(self.client_sockets)}")
        # Send current connection status and state snapshot to newly connected client
        await self.send_to_socket(websocket, {
            "type": "INITIAL_CLIENT_STATE",
            "connected": self.is_foundry_connected,
            "state": self.get_current_state()
        })

    def disconnect_client(self, websocket: WebSocket) -> None:
        self.client_sockets.discard(websocket)
        logger.info(f"Client UI disconnected. Remaining clients: {len(self.client_sockets)}")

    async def send_to_socket(self, ws: WebSocket, message: Dict[str, Any]) -> None:
        try:
            await ws.send_text(json.dumps(message))
        except Exception as e:
            logger.warning(f"Failed to send to socket: {e}")

    async def broadcast_to_clients(self, message: Dict[str, Any]) -> None:
        if not self.client_sockets:
            return
        payload = json.dumps(message)
        dead_sockets = set()
        for ws in self.client_sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            self.client_sockets.discard(ws)

    def get_current_state(self) -> Dict[str, Any]:
        return {
            "isFoundryConnected": self.is_foundry_connected,
            "actors": self.actors,
            "partyInventory": self.party_inventory,
            "journals": self.journals,
            "activeScene": self.active_scene
        }

    async def call_foundry(self, action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 15.0) -> Any:
        """
        Execute an RPC action on Foundry via the active GM Bridge WebSocket.
        Uses asyncio.Future to await the response with a timeout.
        """
        if not self.foundry_ws:
            raise ConnectionError("Foundry Bridge is not connected. Cannot dispatch command.")

        request_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self.pending_rpcs[request_id] = future

        message = {
            "requestId": request_id,
            "action": action,
            "params": params or {}
        }

        try:
            await self.foundry_ws.send_text(json.dumps(message))
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            raise TimeoutError(f"Foundry RPC action '{action}' timed out after {timeout} seconds.")
        finally:
            self.pending_rpcs.pop(request_id, None)

    async def handle_foundry_message(self, message: Dict[str, Any]) -> None:
        """Route incoming messages and events from Foundry."""
        msg_type = message.get("type")

        # 1. RPC Response
        if msg_type == "RPC_RESPONSE":
            req_id = message.get("requestId")
            if req_id and req_id in self.pending_rpcs:
                fut = self.pending_rpcs[req_id]
                if not fut.done():
                    if message.get("error"):
                        fut.set_exception(RuntimeError(message["error"]))
                    else:
                        fut.set_result(message.get("result"))
            return

        # 2. Initial World Sync
        if msg_type == "INITIAL_SYNC":
            sync_data = message.get("data", {})
            self.actors = sync_data.get("actors", [])
            self.party_inventory = sync_data.get("partyInventory")
            self.journals = sync_data.get("journals", [])
            self.active_scene = sync_data.get("activeScene")

            now = int(time.time() * 1000)
            await set_world_cache("last_sync", sync_data, now, self.db_path)
            logger.info(f"Synchronized with Foundry: {len(self.actors)} actors, {len(self.journals)} journals.")
            await self.broadcast_to_clients({
                "type": "SYNC_UPDATE",
                "timestamp": now,
                "data": sync_data
            })
            return

        # 3. Action Log Hook (Rolls, Chat, Whispers)
        if msg_type == "ACTION_LOGGED":
            await insert_action_log(message, self.db_path)
            await self.broadcast_to_clients(message)
            return

        # 4. Actor Updated Hook
        if msg_type == "ACTOR_UPDATED":
            updated_actor = message.get("actor")
            if updated_actor:
                # Update in cached list
                actor_id = updated_actor.get("id")
                found = False
                for i, a in enumerate(self.actors):
                    if a.get("id") == actor_id:
                        self.actors[i] = updated_actor
                        found = True
                        break
                if not found and updated_actor.get("hasPlayerOwner"):
                    self.actors.append(updated_actor)

                # Check if it was Party Inventory
                if self.party_inventory and self.party_inventory.get("id") == actor_id:
                    self.party_inventory = updated_actor
                elif updated_actor.get("name", "").lower() == "party inventory":
                    self.party_inventory = updated_actor

            await self.broadcast_to_clients(message)
            return

        # 5. Inventory Changed Hook
        if msg_type == "INVENTORY_CHANGED":
            actor_id = message.get("actorId")
            actor_obj = message.get("actor")
            if actor_obj and actor_id:
                for i, a in enumerate(self.actors):
                    if a.get("id") == actor_id:
                        self.actors[i] = actor_obj
                        break
                if self.party_inventory and self.party_inventory.get("id") == actor_id:
                    self.party_inventory = actor_obj

            await self.broadcast_to_clients(message)
            return

        # 6. Journal Note Updated Hook
        if msg_type == "NOTE_UPDATED":
            journal_id = message.get("journalId")
            page_id = message.get("pageId")
            for j in self.journals:
                if j.get("id") == journal_id:
                    for p in j.get("pages", []):
                        if p.get("id") == page_id:
                            p["content"] = message.get("content", "")
                            p["name"] = message.get("name", p["name"])
            await self.broadcast_to_clients(message)
            return

        # 7. Handout Shown Hook
        if msg_type == "HANDOUT_SHOWN":
            await self.broadcast_to_clients(message)
            return

        # Catch-all broadcast for any other custom events
        await self.broadcast_to_clients(message)

# Global singleton instance
manager = ConnectionManager()
