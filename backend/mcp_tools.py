"""
FastMCP Server for Foundry VTT Tabletop Architect
Exposes high-level tools for AI agents to query and manipulate the live Foundry VTT session.
Supports both in-process FastAPI execution and standalone stdio MCP server execution.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP

# Ensure local backend modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connection_manager import manager

logger = logging.getLogger("foundry-hub.mcp_tools")
logger.setLevel(logging.INFO)

mcp = FastMCP("FoundryVTT-Architect")

FOUNDRY_BASE_URL = os.getenv("FOUNDRY_URL", "http://localhost:30000")
HUB_API_URL = os.getenv("HUB_API_URL", "http://127.0.0.1:8080")
DEFAULT_ADMIN_PASSWORD = os.getenv("FOUNDRY_ADMIN_PASSWORD", "1235")
CSRF_HEADERS = {
    "origin": FOUNDRY_BASE_URL,
    "sec-fetch-site": "same-origin",
    "referer": f"{FOUNDRY_BASE_URL}/"
}

_headless_proc: Optional[subprocess.Popen] = None

PID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".headless.pid")

def _ensure_headless_bridge_process():
    """Ensure background headless GM bridge worker is running without zombie processes."""
    global _headless_proc
    if _headless_proc and _headless_proc.poll() is None:
        return _headless_proc

    # Clean up any stale process from PID file
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, "r") as f:
                old_pid = int(f.read().strip())
            if old_pid:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(old_pid)], capture_output=True)
                else:
                    os.kill(old_pid, 15)
        except Exception:
            pass

    bridge_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "headless_bridge.py")
    if os.path.exists(bridge_script):
        try:
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW

            _headless_proc = subprocess.Popen(
                [sys.executable, bridge_script],
                cwd=os.path.dirname(bridge_script),
                creationflags=creationflags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            logger.info(f"Spawned background headless GM bridge worker (PID: {_headless_proc.pid})")
        except Exception as e:
            logger.warning(f"Could not spawn headless bridge worker: {e}")
    return _headless_proc

async def _dispatch_action(action: str, params: Dict[str, Any]) -> Any:
    """
    Dispatch action to Foundry:
    1. If running in-process with active GM WebSocket, use connection manager.
    2. Otherwise, forward via HTTP to the running Tabletop Hub backend.
    3. Auto-recovers if GM bridge was disconnected by triggering the headless runner.
    """
    if manager.is_foundry_connected:
        return await manager.call_foundry(action, params)

    # Attempt to auto-recover if bridge is not connected
    hub_url = os.getenv("HUB_API_URL", HUB_API_URL)
    async with httpx.AsyncClient(base_url=hub_url, timeout=20.0) as client:
        try:
            resp = await client.post("/api/command", json={"action": action, "params": params})
            if resp.status_code == 200:
                data = resp.json()
                return data.get("result", data)
            elif resp.status_code == 503:
                # Bridge disconnected - trigger headless bridge and wait up to 6s
                logger.info("Foundry GM Bridge disconnected. Attempting auto-reconnection...")
                _ensure_headless_bridge_process()
                for _ in range(12):
                    await asyncio.sleep(0.5)
                    health = await client.get("/api/health")
                    if health.status_code == 200 and health.json().get("foundryConnected"):
                        # Re-dispatch action
                        retry_resp = await client.post("/api/command", json={"action": action, "params": params})
                        if retry_resp.status_code == 200:
                            data = retry_resp.json()
                            return data.get("result", data)
                        break

                raise RuntimeError(
                    "Foundry VTT GM Bridge is not connected. A Foundry world must be active and logged in as Gamemaster. "
                    "Use enter_world to launch and connect automatically."
                )
            raise RuntimeError(f"Foundry Hub returned {resp.status_code}: {resp.text}")
        except httpx.ConnectError:
            raise RuntimeError(
                f"Cannot connect to Tabletop Hub backend at {hub_url}. Please ensure the hub backend is running."
            )

# ----------------- FOUNDRY LIFECYCLE & NAVIGATION TOOLS ----------------- #

@mcp.tool()
async def enter_world(
    world_id: str = "tabletop-campaign",
    admin_password: str = DEFAULT_ADMIN_PASSWORD,
    user_name: str = "MCP Bot"
) -> Dict[str, Any]:
    """
    Launch and enter a Foundry VTT world headlessly without needing Playwright or a visible browser window.
    Directly interfaces with Foundry's Setup REST API and maintains the background GM bridge connection.
    """
    async with httpx.AsyncClient(base_url=FOUNDRY_BASE_URL, headers=CSRF_HEADERS, follow_redirects=True, timeout=15.0) as client:
        # 1. Check if Foundry is reachable
        try:
            join_resp = await client.get("/join")
        except httpx.ConnectError:
            raise RuntimeError(f"Foundry VTT is not reachable at {FOUNDRY_BASE_URL}. Ensure Foundry server is running.")

        is_setup = "/setup" in str(join_resp.url) or "Administrator Access Required" in join_resp.text or "Game Worlds" in join_resp.text
        is_already_active = not is_setup and world_id in join_resp.text

        if not is_already_active:
            # Authenticate as admin
            auth_resp = await client.post("/auth", json={"adminPassword": admin_password})
            if auth_resp.status_code != 200 and auth_resp.status_code != 302:
                raise RuntimeError("Failed to authenticate as server administrator. Check admin_password.")

            # If a different world is currently running, shut it down first
            if not is_setup:
                await client.post("/setup", json={"action": "worldShutdown", "adminPassword": admin_password})
                await asyncio.sleep(1.0)

            # Launch requested world
            launch_resp = await client.post("/setup", json={
                "action": "launchWorld",
                "world": world_id,
                "adminPassword": admin_password
            })
            if launch_resp.status_code != 200:
                raise RuntimeError(f"Failed to launch world '{world_id}': {launch_resp.text}")
            await asyncio.sleep(2.0)

    # 2. Start or ensure headless GM bridge is connected
    _ensure_headless_bridge_process()

    # 3. Wait for hub to register bridge connection
    hub_url = os.getenv("HUB_API_URL", HUB_API_URL)
    connected = False
    async with httpx.AsyncClient(base_url=hub_url, timeout=5.0) as client:
        for _ in range(15):
            try:
                health = await client.get("/api/health")
                if health.status_code == 200 and health.json().get("foundryConnected"):
                    connected = True
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)

    return {
        "success": True,
        "world": world_id,
        "user": user_name,
        "bridgeConnected": connected,
        "status": f"World '{world_id}' is active and connected to Tabletop Hub." if connected else f"World '{world_id}' is active. Bridge worker starting..."
    }

@mcp.tool()
async def list_worlds() -> Dict[str, Any]:
    """
    List all installed worlds in the local Foundry VTT installation and identify the active world.
    """
    data_dir = os.path.expandvars(os.getenv("FOUNDRY_DATA_PATH", "%LOCALAPPDATA%\\FoundryVTT\\Data"))
    worlds_dir = os.path.join(data_dir, "worlds")
    worlds_list = []

    if os.path.exists(worlds_dir):
        for entry in os.scandir(worlds_dir):
            if entry.is_dir():
                manifest = os.path.join(entry.path, "world.json")
                if os.path.exists(manifest):
                    try:
                        with open(manifest, "r", encoding="utf-8") as f:
                            wdata = json.load(f)
                            worlds_list.append({
                                "id": wdata.get("id", entry.name),
                                "title": wdata.get("title", entry.name),
                                "description": wdata.get("description", ""),
                                "system": wdata.get("system", ""),
                                "coreVersion": wdata.get("coreVersion", "")
                            })
                    except Exception as e:
                        logger.warning(f"Failed to read manifest {manifest}: {e}")

    # Detect currently active world if Foundry is reachable
    active_world_id = None
    try:
        async with httpx.AsyncClient(base_url=FOUNDRY_BASE_URL, timeout=3.0, follow_redirects=True) as client:
            resp = await client.get("/join")
            if resp.status_code == 200:
                for w in worlds_list:
                    if w["title"] in resp.text:
                        active_world_id = w["id"]
                        break
    except Exception:
        pass

    return {
        "worlds": worlds_list,
        "total": len(worlds_list),
        "activeWorld": active_world_id
    }

@mcp.tool()
async def get_bridge_status() -> Dict[str, Any]:
    """
    Check the operational status of the Foundry Tabletop Hub stack:
    - Foundry server availability (port 30000)
    - Hub API & SQLite database status (port 8080)
    - Active GM WebSocket bridge connectivity
    - Connected Player UI clients
    """
    foundry_alive = False
    active_world = None
    try:
        async with httpx.AsyncClient(base_url=FOUNDRY_BASE_URL, timeout=3.0, follow_redirects=True) as client:
            resp = await client.get("/join")
            foundry_alive = (resp.status_code == 200)
            if "/setup" not in str(resp.url):
                # Search for world title in page title tag
                if "<title>" in resp.text:
                    active_world = resp.text.split("<title>")[1].split("</title>")[0].strip()
    except Exception:
        pass

    hub_alive = False
    bridge_connected = False
    clients_count = 0
    try:
        hub_url = os.getenv("HUB_API_URL", HUB_API_URL)
        async with httpx.AsyncClient(base_url=hub_url, timeout=3.0) as client:
            resp = await client.get("/api/health")
            if resp.status_code == 200:
                hub_alive = True
                data = resp.json()
                bridge_connected = data.get("foundryConnected", False)
                clients_count = data.get("clientsConnected", 0)
    except Exception:
        pass

    return {
        "foundryServerRunning": foundry_alive,
        "foundryUrl": FOUNDRY_BASE_URL,
        "activeWorld": active_world,
        "hubBackendRunning": hub_alive,
        "hubUrl": HUB_API_URL,
        "gmBridgeConnected": bridge_connected,
        "connectedWebClients": clients_count
    }

# ----------------- FOUNDRY WORLD ENTITY & DATA TOOLS ----------------- #

@mcp.tool()
async def get_world_summary() -> Dict[str, Any]:
    """
    Get a summary of the active Foundry VTT session, including active users,
    actors, journals, scenes, and compendium packs.
    """
    return await _dispatch_action("GET_WORLD_SUMMARY", {})

@mcp.tool()
async def get_actor_sheet(actor_id_or_name: str) -> Dict[str, Any]:
    """
    Retrieve full character sheet details and runtime derived attributes
    (HP, AC, abilities, skills, spell slots, inventory items) for a specified actor.
    """
    return await _dispatch_action("GET_ACTOR_DETAILS", {"actorIdOrName": actor_id_or_name})

@mcp.tool()
async def search_compendium(query: str, document_type: str = "Item", limit: int = 15) -> Dict[str, Any]:
    """
    Search compendium pack indexes in Foundry for items, spells, feats, or actors matching the query.
    """
    return await _dispatch_action("SEARCH_COMPENDIUM", {
        "query": query,
        "documentType": document_type,
        "limit": limit
    })

@mcp.tool()
async def grant_compendium_item(target_actor: str, item_uuid: str, quantity: int = 1) -> Dict[str, Any]:
    """
    Grant an item from a Foundry compendium pack (by UUID) to a target actor (by ID or name).
    """
    return await _dispatch_action("GRANT_COMPENDIUM_ITEM", {
        "targetActor": target_actor,
        "itemUuid": item_uuid,
        "quantity": quantity
    })

@mcp.tool()
async def transfer_inventory_item(
    source_actor_id: str,
    target_actor_id: str,
    item_id: str,
    quantity: int = 1
) -> Dict[str, Any]:
    """
    Atomically transfer an item and quantity between two actors (e.g. from player to Party Inventory).
    """
    return await _dispatch_action("TRANSFER_ITEM", {
        "sourceActorId": source_actor_id,
        "targetActorId": target_actor_id,
        "itemId": item_id,
        "quantity": quantity
    })

@mcp.tool()
async def upsert_shared_note(
    journal_name: str = "Party Shared Notes",
    page_name: str = "General Notes",
    markdown_content: str = "",
    show_to_players: bool = False
) -> Dict[str, Any]:
    """
    Create or update a markdown page within a Foundry journal entry, optionally showing it to players.
    """
    return await _dispatch_action("UPSERT_JOURNAL_PAGE", {
        "journalName": journal_name,
        "pageName": page_name,
        "markdownContent": markdown_content,
        "showToPlayers": show_to_players
    })

@mcp.tool()
async def scaffold_tabletop_world() -> Dict[str, Any]:
    """
    Turnkey setup tool that automatically creates:
    1. A 'Tabletop' user for the projector display (if missing)
    2. An 'MCP Bot' user with Assistant GM role for headless background bridges (if missing)
    3. A 'Party Inventory' actor with full ownership for players (if missing)
    4. A 'Party Shared Notes' journal entry with player ownership (if missing)
    """
    js_code = """
    let tableUser = game.users.getName("Tabletop");
    if (!tableUser) {
      tableUser = await User.create({
        name: "Tabletop",
        role: CONST.USER_ROLES?.PLAYER || 1
      });
    }

    let botUser = game.users.getName("MCP Bot");
    if (!botUser) {
      botUser = await User.create({
        name: "MCP Bot",
        role: CONST.USER_ROLES?.ASSISTANT || 3
      });
    }

    let partyActor = game.actors.getName("Party Inventory");
    if (!partyActor) {
      partyActor = await Actor.create({
        name: "Party Inventory",
        type: "npc",
        img: "icons/containers/bags/pack-leather-brown.webp",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      });
    }

    let sharedJournal = game.journal.getName("Party Shared Notes");
    if (!sharedJournal) {
      sharedJournal = await JournalEntry.create({
        name: "Party Shared Notes",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      });
      await sharedJournal.createEmbeddedDocuments("JournalEntryPage", [{
        name: "General Campaign Notes",
        type: "text",
        text: {
          content: "# Party Shared Notes\\n\\nWelcome to your shared party notes!",
          format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN || 2
        }
      }]);
    }

    return {
      tabletopUser: tableUser.name,
      botUser: botUser.name,
      partyActor: partyActor.name,
      journalEntry: sharedJournal.name,
      status: "Tabletop world scaffolding complete."
    };
    """
    return await _dispatch_action("EXECUTE_SCRIPT", {"code": js_code})

@mcp.tool()
async def ensure_tabletop_permissions() -> Dict[str, Any]:
    """
    Audit all player characters and ensure they have Observer (level 2) permissions
    set for the Tabletop projector user. Gated strictly to player-owned characters
    to prevent spoiling DM-controlled secret NPCs or monsters.
    """
    js_code = """
    const tabletop = game.users.getName("Tabletop");
    if (!tabletop) {
      return { success: false, error: "Tabletop user not found. Run scaffold_tabletop_world first." };
    }

    const partyActor = game.actors.getName("Party Inventory");
    // Strict guard: ONLY player-owned character sheets (never secret DM NPCs or monsters)
    const playerCharacters = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner && a.id !== partyActor?.id);

    const audited = [];
    for (const actor of playerCharacters) {
      let ownership = { ...actor.ownership };
      if (ownership[tabletop.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
        ownership[tabletop.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        await actor.update({ ownership });
      }
      audited.push({
        id: actor.id,
        name: actor.name,
        tabletopPermission: "OBSERVER (Level 2)"
      });
    }

    return {
      success: true,
      tabletopUser: { id: tabletop.id, name: tabletop.name },
      charactersAudited: audited,
      totalCharacters: playerCharacters.length,
      status: `Confirmed Observer permissions for Tabletop user on ${playerCharacters.length} player character(s).`
    };
    """
    return await _dispatch_action("EXECUTE_SCRIPT", {"code": js_code})

@mcp.tool()
async def import_hero(hero_name: str = "Perrin") -> Dict[str, Any]:
    """
    Import a starter hero from the D&D 5e Starter Heroes compendium pack into the active world.
    Automatically assigns Observer permissions to the Tabletop user and sets player ownership.
    """
    js_code = f"""
    const pack = game.packs.get("dnd5e.heroes");
    if (!pack) throw new Error("Compendium pack dnd5e.heroes not found");
    await pack.getIndex();
    const entry = pack.index.find(e => e.name.toLowerCase().includes("{hero_name.lower()}"));
    if (!entry) throw new Error(`Hero matching '{hero_name}' not found in Starter Heroes pack.`);
    const doc = await pack.getDocument(entry._id || entry.id);
    const data = doc.toObject();
    delete data._id;

    const tabletop = game.users.getName("Tabletop");
    data.ownership = {{ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }};
    if (tabletop) {{
      data.ownership[tabletop.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }}

    const created = await Actor.create(data);
    return {{
      id: created.id,
      name: created.name,
      type: created.type,
      img: created.img,
      tabletopPermission: "OBSERVER"
    }};
    """
    return await _dispatch_action("EXECUTE_SCRIPT", {"code": js_code})

@mcp.tool()
async def execute_foundry_js(code: str) -> Dict[str, Any]:
    """
    Execute arbitrary asynchronous JavaScript in the active Foundry GM context.
    Has full access to `game`, `canvas`, `ui`, and `CONST`.
    """
    return await _dispatch_action("EXECUTE_SCRIPT", {"code": code})

if __name__ == "__main__":
    mcp.run()
