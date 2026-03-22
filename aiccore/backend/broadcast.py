"""
WebSocket fan-out for AICCORE.

- **No Redis URL:** messages go only to WebSockets attached to this process (fine for one worker).
- **AICCORE_REDIS_URL or REDIS_URL set:** each `broadcast()` publishes to a Redis channel; every
  worker runs a subscriber that pushes to its local connections — safe with multiple Uvicorn/Gunicorn workers.

Optional: ``AICCORE_REDIS_CHANNEL`` (default ``aiccore:broadcast``).
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import List, Optional

from fastapi import WebSocket


class BroadcastManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self._channel = (os.getenv("AICCORE_REDIS_CHANNEL") or "aiccore:broadcast").strip()
        self._redis_url = (os.getenv("AICCORE_REDIS_URL") or os.getenv("REDIS_URL") or "").strip()
        self._redis: Optional[object] = None
        self._listen_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Call once at app startup (e.g. FastAPI on_event startup)."""
        if not self._redis_url:
            print("📡 AICCORE broadcast: in-memory only (set AICCORE_REDIS_URL for multi-worker WS).")
            return
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
                # Avoid stale TCP connections after idle periods (common on hosted Redis).
                health_check_interval=30,
            )
            await client.ping()
            self._redis = client
            self._listen_task = asyncio.create_task(self._redis_listen_loop())
            print(f"📡 AICCORE broadcast: Redis pub/sub channel={self._channel!r}")
        except Exception as e:
            print(f"⚠️ AICCORE broadcast: Redis unavailable ({e}); using in-memory only.")
            self._redis = None

    async def shutdown(self) -> None:
        if self._listen_task is not None:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            self._listen_task = None
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:
                pass
            self._redis = None

    async def _redis_listen_loop(self) -> None:
        """Subscribe loop with reconnect — a single connection drop must not stop fan-out forever."""
        if self._redis is None:
            return
        backoff = 1.0
        while self._redis is not None:
            pubsub = self._redis.pubsub()
            try:
                await pubsub.subscribe(self._channel)
                backoff = 1.0
                while self._redis is not None:
                    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                    if msg is None or msg.get("type") != "message":
                        continue
                    data = msg.get("data")
                    if isinstance(data, str):
                        await self._local_fanout_raw(data)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(
                    f"⚠️ AICCORE broadcast: Redis subscriber error ({e}); "
                    f"reconnecting in {backoff:.0f}s"
                )
                await asyncio.sleep(min(backoff, 30.0))
                backoff = min(backoff * 2.0, 30.0)
            finally:
                try:
                    await pubsub.unsubscribe(self._channel)
                except Exception:
                    pass
                try:
                    await pubsub.aclose()
                except Exception:
                    pass

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📡 New spectator connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"📡 Spectator disconnected. Total: {len(self.active_connections)}")

    async def _local_fanout_raw(self, message_str: str) -> None:
        if not self.active_connections:
            return
        conns = list(self.active_connections)
        tasks = [conn.send_text(message_str) for conn in conns]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for conn, result in zip(conns, results):
            if isinstance(result, Exception):
                self.disconnect(conn)

    async def broadcast(self, message: dict) -> None:
        message_str = json.dumps(message, default=str)
        if self._redis is not None:
            try:
                await self._redis.publish(self._channel, message_str)
                return
            except Exception as e:
                print(f"⚠️ AICCORE broadcast: Redis publish failed ({e}); local fan-out only.")
        await self._local_fanout_raw(message_str)


broadcast_manager = BroadcastManager()
