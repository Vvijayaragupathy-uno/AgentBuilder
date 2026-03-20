import json
import asyncio
from typing import List
from fastapi import WebSocket

class BroadcastManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📡 New spectator connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"📡 Spectator disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return

        message_str = json.dumps(message, default=str)
        # Snapshot list — disconnect mutates active_connections during iteration
        conns = list(self.active_connections)
        tasks = [conn.send_text(message_str) for conn in conns]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for conn, result in zip(conns, results):
            if isinstance(result, Exception):
                self.disconnect(conn)

broadcast_manager = BroadcastManager()
