from __future__ import annotations

from typing import Dict, Any
import asyncio


class SessionState:
    """In-memory session registry for early development.

    For persistence across restarts, migrate to shared SQLite (see slide_orchestrator.shared_memory)
    or a small Redis instance. This keeps the first iteration simple.
    """

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}

    def ensure(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "seq": 0,
                "topic": None,
                "user_id": None,
                "notes": [],  # running teaching notes/outline
            }
            self._locks[session_id] = asyncio.Lock()
        return self._sessions[session_id]

    def get(self, session_id: str) -> Dict[str, Any]:
        return self._sessions.get(session_id) or {}

    def next_seq(self, session_id: str) -> int:
        st = self.ensure(session_id)
        st["seq"] = int(st.get("seq", 0)) + 1
        return st["seq"]

    def lock(self, session_id: str) -> asyncio.Lock:
        self.ensure(session_id)
        return self._locks[session_id]


session_state = SessionState()









