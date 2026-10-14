"""
Foundry Tabletop Hub - FastAPI Backend
Provides WebSocket endpoints for Foundry and Clients, REST API for UI controls, and mounts FastMCP.
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import (
    DEFAULT_DB_PATH,
    init_db,
    get_recent_action_logs,
    record_item_transfer,
    get_item_ledger,
    save_character_drawing,
    get_character_drawing
)
from connection_manager import manager
from mcp_tools import mcp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("foundry-hub.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables
    db_path = os.getenv("HUB_DB_PATH", manager.db_path or DEFAULT_DB_PATH)
    manager.db_path = db_path
    await init_db(db_path)
    logger.info("Foundry Hub database initialized.")
    yield
    logger.info("Shutting down Foundry Hub.")

app = FastAPI(
    title="Foundry Tabletop Hub & MCP Bridge",
    description="Middleware bridging Foundry VTT GM client with AI agents and player web interfaces.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local and LAN access (tablets, phones, laptops)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CommandRequest(BaseModel):
    action: str
    params: Dict[str, Any] = Field(default_factory=dict)

# ----------------- WEBSOCKET ROUTES ----------------- #

@app.websocket("/ws/foundry")
async def websocket_foundry_endpoint(websocket: WebSocket):
    """WebSocket endpoint dedicated to the Foundry VTT GM bridge module."""
    await manager.connect_foundry(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
                await manager.handle_foundry_message(data)
            except json.JSONDecodeError:
                logger.error("Received invalid JSON from Foundry socket.")
    except WebSocketDisconnect:
        await manager.disconnect_foundry(websocket)
    except Exception as e:
        logger.error(f"Error in Foundry WebSocket loop: {e}")
        await manager.disconnect_foundry(websocket)

@app.websocket("/ws/client")
async def websocket_client_endpoint(websocket: WebSocket):
    """WebSocket endpoint for custom player/GM web user interfaces."""
    await manager.connect_client(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
                msg_type = data.get("type")
                if msg_type == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.debug(f"Error in Client WebSocket: {e}")
        manager.disconnect_client(websocket)

# ----------------- REST API ROUTES ----------------- #

@app.get("/api/health")
async def api_health():
    return {
        "status": "healthy",
        "foundryConnected": manager.is_foundry_connected,
        "clientsConnected": len(manager.client_sockets),
        "timestamp": int(time.time() * 1000)
    }

@app.get("/api/state")
async def api_get_state():
    """Returns cached actors, party inventory, journals, scenes, and recent logs."""
    state = manager.get_current_state()
    recent_logs = await get_recent_action_logs(limit=50, db_path=manager.db_path)
    return {
        "status": "ok",
        "isFoundryConnected": state["isFoundryConnected"],
        "actors": state["actors"],
        "partyInventory": state["partyInventory"],
        "journals": state["journals"],
        "activeScene": state["activeScene"],
        "actionLogs": recent_logs
    }

@app.post("/api/command")
async def api_send_command(cmd: CommandRequest):
    """Forwards commands from the Web UI to Foundry via RPC."""
    if not manager.is_foundry_connected:
        raise HTTPException(
            status_code=503,
            detail="Foundry VTT GM Bridge is not currently connected."
        )

    try:
        result = await manager.call_foundry(cmd.action, cmd.params)

        # If it was an item transfer, record in item ledger
        if cmd.action == "TRANSFER_ITEM" and result:
            await record_item_transfer(
                source_actor=str(result.get("sourceActor", cmd.params.get("sourceActorId"))),
                target_actor=str(result.get("targetActor", cmd.params.get("targetActorId"))),
                item_name=str(result.get("itemName", cmd.params.get("itemId"))),
                quantity=int(result.get("transferredQuantity", cmd.params.get("quantity", 1))),
                timestamp=int(time.time() * 1000),
                db_path=manager.db_path
            )

        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Command execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ledger")
async def api_get_ledger(limit: int = 50):
    """Retrieve history of item transfers."""
    records = await get_item_ledger(limit=limit, db_path=manager.db_path)
    return {"ledger": records}

class DrawingSaveRequest(BaseModel):
    drawingJson: str

@app.get("/api/drawings/{actor_id}")
async def api_get_drawing(actor_id: str):
    """Retrieve handwritten stylus strokes for an actor."""
    drawing = await get_character_drawing(actor_id, db_path=manager.db_path)
    return {"actorId": actor_id, "drawingJson": drawing or ""}

@app.post("/api/drawings/{actor_id}")
async def api_save_drawing(actor_id: str, req: DrawingSaveRequest):
    """Save handwritten stylus strokes for an actor."""
    await save_character_drawing(
        actor_id=actor_id,
        drawing_json=req.drawingJson,
        timestamp=int(time.time() * 1000),
        db_path=manager.db_path
    )
    return {"success": True, "actorId": actor_id}

# ----------------- MOUNT MCP SERVER ----------------- #
# FastMCP provides an SSE sub-application
try:
    sse_app = mcp.sse_app()
    app.mount("/mcp", sse_app)
    logger.info("FastMCP SSE endpoint mounted at /mcp.")
except Exception as e:
    logger.warning(f"Could not mount FastMCP SSE app directly: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
