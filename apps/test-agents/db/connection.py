import aiosqlite
from pathlib import Path

DB_PATH = str(Path(__file__).resolve().parent.parent / "mock_financial.sqlite3")


async def query_db(sql: str, params: tuple = ()) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def execute_db(sql: str, params: tuple = ()) -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(sql, params)
        await db.commit()
        return "OK"
