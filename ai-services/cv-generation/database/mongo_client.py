"""Async MongoDB connection.

`get_db()` is the only entry point — services should depend on this rather
than holding their own client instances. The client is lazily initialised
on first call and reused for the lifetime of the process.
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import MONGODB_DB_NAME, MONGODB_URI

_client: AsyncIOMotorClient | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
    return _client[MONGODB_DB_NAME]


async def close():
    global _client
    if _client is not None:
        _client.close()
        _client = None
