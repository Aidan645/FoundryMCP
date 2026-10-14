# Foundry Tabletop Hub & MCP Bridge

An end-to-end automation bridge and player companion hub for **Foundry Virtual Tabletop (Foundry VTT v14+ / D&D 5e)**, combining:
- **Model Context Protocol (MCP) Server**: Exposes rich D&D 5e world inspection, character imports, item distribution, journals, and scripting to AI agents (Claude, Gemini, Antigravity).
- **FastAPI Middleware (`backend/`)**: High-performance WebSocket & REST server synchronizing Foundry documents, real-time rolls, action logs, and item transfer audit ledgers into SQLite.
- **Headless GM Bridge (`backend/headless_bridge.py`)**: Persistent background client running as `MCP Bot` in zero-canvas mode (`core.noCanvas`), keeping the AI bridge alive with ~85% reduced RAM/GPU overhead while human GMs interact freely.
- **Stylus & Touch Player App (`frontend/`)**: React + TypeScript + Tailwind companion web application engineered specifically for **iPad (Apple Pencil)** and **Samsung Galaxy Tab (S-Pen)** with real-time pressure sensitivity, active palm rejection, and persistent handwritten ink layers.
- **Foundry GM Bridge Module (`foundry-module/`)**: Ambiguity-safe document resolvers, dialog-free fast-forward roll execution (`configure: false`), and leader election to prevent duplicate action hooks.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   AI Agent (FastMCP SSE)    |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |    FastAPI Middleware       |
                      |   (Port 8080 / SQLite DB)   |
                      +-------+--------------+------+
                              |              |
           WebSocket /ws/foundry             | WebSocket /ws/client
                              |              v
+-----------------------------+------+   +------------------------------+
|     Foundry VTT (Port 30000)       |   | Player Companion Web App     |
| - bridge.js (GM Bridge Module)     |   | (Port 5173 / Vite + React)   |
| - Headless Bot ("MCP Bot", noCanvas)|  | - Apple Pencil / S-Pen Ink   |
| - Human GM (Zero collision)        |   | - Palm Guard / Touch targets |
+------------------------------------+   +------------------------------+
```

---

## Features

### 1. FastMCP Tool Suite
Exposed to MCP-compliant AI assistants:
* `get_world_summary`: Live snapshot of actors, party inventory, scenes, online users, and journals.
* `get_actor_sheet`: Full character stats, spell slots, items, features, and activities.
* `search_compendium`: Full-text search across D&D 5e compendiums (SRD items, spells, monsters).
* `grant_compendium_item`: Safely imports compendium items directly onto an actor.
* `transfer_inventory_item`: Transfers items between heroes and party stash with stacking checks and SQLite audit logging.
* `upsert_shared_note`: Creates and updates shared campaign notes, with optional broadcast popup to player screens.
* `scaffold_tabletop_world`: Bootstraps essential tabletop infrastructure (`Tabletop` user, `Party Inventory`, `Party Shared Notes`, and permissions).
* `execute_foundry_js`: Runs arbitrary sandboxed Foundry JavaScript expressions.
* `enter_world`: Switches active Foundry worlds via HTTP without UI automation.

### 2. Tablet & Stylus Ergonomics
* **Apple Pencil & S-Pen Pressure:** Integrated with [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand) for natural variable-width calligraphy strokes.
* **Palm Guard (Palm Rejection):** Ignores resting hands and finger touches (`e.pointerType === 'touch'`) while writing.
* **Persistent Ink Overlays:** Saves handwritten markings per character to the SQLite hub database.
* **44px+ Touch Targets:** Built for comfortable tablet tapping during game sessions.

### 3. Resilient Multi-User GM Architecture
* **Dedicated MCP Bot Identity:** Prevents session collision when a human GM logs into Foundry.
* **Zero-Canvas Headless Mode:** Headless Playwright runner disables WebGL canvas (`core.noCanvas`), dropping background GPU/RAM usage by ~85%.
* **Dialog-Free Rolls:** dnd5e rolls execute automatically with `configure: false` to prevent hanging promises inside the headless browser.

---

## Quickstart

### Prerequisites
* Windows 10/11 or macOS/Linux
* Foundry Virtual Tabletop v14+ (running with D&D 5e system)
* Python 3.11+
* Node.js v18+

### Installation & Launch

1. **Clone repository:**
   ```bash
   git clone https://github.com/Aidan645/FoundryMCP.git
   cd FoundryMCP
   ```

2. **Automated Setup (Windows):**
   ```powershell
   .\setup-windows.ps1
   ```

3. **Start All Services:**
   ```powershell
   .\start-dev.ps1
   ```

4. **Access Interfaces:**
   * **Foundry VTT**: [http://localhost:30000](http://localhost:30000)
   * **Tabletop Companion App**: [http://localhost:5173](http://localhost:5173) (or tablet LAN IP)
   * **REST State & Ledger**: [http://localhost:8080/api/state](http://localhost:8080/api/state)
   * **MCP SSE Endpoint**: `http://localhost:8080/mcp/sse`

---

## License
MIT
