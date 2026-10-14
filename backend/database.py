"""
Database layer for Foundry Tabletop Hub
Uses SQLite via aiosqlite for action logging, item transfer ledger, and world cache.
"""

import json
import os
import aiosqlite
from typing import Any, Dict, List, Optional

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "hub.db")

async def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """Initialize SQLite database tables."""
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS action_logs (
                id TEXT PRIMARY KEY,
                timestamp INTEGER,
                actor_id TEXT,
                speaker TEXT,
                flavor TEXT,
                content TEXT,
                roll_formula TEXT,
                roll_total INTEGER,
                is_crit INTEGER,
                is_fumble INTEGER,
                raw_json TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS item_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER,
                source_actor TEXT,
                target_actor TEXT,
                item_name TEXT,
                quantity INTEGER
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS world_cache (
                key TEXT PRIMARY KEY,
                json_data TEXT,
                updated_at INTEGER
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS character_drawings (
                actor_id TEXT PRIMARY KEY,
                drawing_json TEXT,
                updated_at INTEGER
            )
        """)
        await db.commit()

async def insert_action_log(log_data: Dict[str, Any], db_path: str = DEFAULT_DB_PATH) -> None:
    """Insert an action log entry from Foundry into SQLite."""
    rolls = log_data.get("rolls") or []
    primary_roll = rolls[0] if rolls else {}

    roll_formula = primary_roll.get("formula", "")
    roll_total = primary_roll.get("total")
    is_crit = 1 if primary_roll.get("isCritical") else 0
    is_fumble = 1 if primary_roll.get("isFumble") else 0

    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT OR REPLACE INTO action_logs (
                id, timestamp, actor_id, speaker, flavor, content, roll_formula, roll_total, is_crit, is_fumble, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(log_data.get("id")),
            int(log_data.get("timestamp") or 0),
            log_data.get("actorId"),
            log_data.get("speaker", "Unknown"),
            log_data.get("flavor", ""),
            log_data.get("content", ""),
            roll_formula,
            roll_total,
            is_crit,
            is_fumble,
            json.dumps(log_data)
        ))
        await db.commit()

async def get_recent_action_logs(limit: int = 50, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """Retrieve recent action logs ordered by timestamp descending."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM action_logs ORDER BY timestamp DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            logs = []
            for row in rows:
                raw = json.loads(row["raw_json"]) if row["raw_json"] else dict(row)
                logs.append(raw)
            return logs

async def record_item_transfer(
    source_actor: str,
    target_actor: str,
    item_name: str,
    quantity: int,
    timestamp: int,
    db_path: str = DEFAULT_DB_PATH
) -> None:
    """Record item transfer in ledger."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT INTO item_ledger (timestamp, source_actor, target_actor, item_name, quantity)
            VALUES (?, ?, ?, ?, ?)
        """, (timestamp, source_actor, target_actor, item_name, quantity))
        await db.commit()

async def get_item_ledger(limit: int = 50, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """Retrieve item ledger entries."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM item_ledger ORDER BY timestamp DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def set_world_cache(key: str, data: Any, timestamp: int, db_path: str = DEFAULT_DB_PATH) -> None:
    """Save cached world data to SQLite."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT OR REPLACE INTO world_cache (key, json_data, updated_at)
            VALUES (?, ?, ?)
        """, (key, json.dumps(data), timestamp))
        await db.commit()

async def get_world_cache(key: str, db_path: str = DEFAULT_DB_PATH) -> Optional[Any]:
    """Retrieve cached world data from SQLite."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT json_data FROM world_cache WHERE key = ?", (key,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["json_data"]:
                return json.loads(row["json_data"])
            return None

async def save_character_drawing(actor_id: str, drawing_json: str, timestamp: int, db_path: str = DEFAULT_DB_PATH) -> None:
    """Save handwritten stylus canvas data for an actor."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT OR REPLACE INTO character_drawings (actor_id, drawing_json, updated_at)
            VALUES (?, ?, ?)
        """, (actor_id, drawing_json, timestamp))
        await db.commit()

async def get_character_drawing(actor_id: str, db_path: str = DEFAULT_DB_PATH) -> Optional[str]:
    """Retrieve handwritten stylus canvas data for an actor."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT drawing_json FROM character_drawings WHERE actor_id = ?", (actor_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["drawing_json"]:
                return str(row["drawing_json"])
            return None

