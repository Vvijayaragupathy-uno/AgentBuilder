"""
WebSocket fan-out for AICCORE.

- Messages go only to WebSockets attached to this process (in-memory only).
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import List, Dict, Any


class BroadcastManager:
    def __init__(self) -> None:
        # Message history for HTTPS polling fallback/replacement
        self.message_pool: List[Dict[str, Any]] = []
        self.max_pool_size = 100
        self.pool_counter = 0

    async def start(self) -> None:
        """Call once at app startup (e.g. FastAPI on_event startup)."""
        print("📡 AICCORE broadcast: Event pool initialized.")

    async def shutdown(self) -> None:
        pass

    async def broadcast(self, message: dict) -> None:
        self.pool_counter += 1
        pooled_msg = {
            "id": self.pool_counter,
            "timestamp": time.time(),
            "data": message
        }
        self.message_pool.append(pooled_msg)
        if len(self.message_pool) > self.max_pool_size:
            self.message_pool.pop(0)

        # WebSockets removed. Clients now use /api/v1/aiccore/events/poll

    def get_pooled_messages(self, since_id: int = 0) -> List[Dict[str, Any]]:
        return [m for m in self.message_pool if m["id"] > since_id]


broadcast_manager = BroadcastManager()
