"""
Abstracted memory store with optional Mem0.ai backend.

If the mem0ai package or MEM0_API_KEY are not present, memory operations
become no-ops and search returns empty results. This ensures graceful
degradation without impacting the chat flow.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import os


class _NoOpMemClient:
    def __init__(self) -> None:
        pass

    async def add(self, *, user_id: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        return None

    async def search(self, *, user_id: str, query: str, limit: int = 5) -> List[str]:
        return []


class _Mem0ClientWrapper:
    def __init__(self, api_key: str):
        # Import inside to avoid hard dependency if package not installed
        from mem0 import MemoryClient  # type: ignore

        self.client = MemoryClient(api_key=api_key)

    async def add(self, *, user_id: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        # The mem0 client is sync; wrap usage in a thread if needed later
        self.client.add(messages=[message], user_id=user_id, metadata=metadata or {})

    async def search(self, *, user_id: str, query: str, limit: int = 5) -> List[str]:
        results = self.client.search(query=query, user_id=user_id, limit=limit)
        # Normalize to simple string snippets
        snippets: List[str] = []
        for r in results or []:
            text = r.get("content") or r.get("text") or r.get("message")
            if text:
                snippets.append(str(text))
        return snippets


class MemoryStore:
    """Facade for storing and retrieving user memories.

    Usage gracefully degrades to no-op when mem0 is not configured.
    """

    def __init__(self) -> None:
        api_key = os.getenv("MEM0_API_KEY")
        if api_key:
            try:
                # Attempt to build the real backend
                self._backend = _Mem0ClientWrapper(api_key)
            except Exception:
                self._backend = _NoOpMemClient()
        else:
            self._backend = _NoOpMemClient()

    async def add_interaction(
        self,
        *,
        user_id: str,
        session_id: str,
        question: str,
        answer: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        # Persist a compact record
        record = f"Q: {question}\nA: {answer}"
        meta = dict(metadata or {})
        if session_id:
            meta["session_id"] = session_id
        await self._backend.add(user_id=user_id, message=record, metadata=meta)

    async def search(self, *, user_id: str, query: str, limit: int = 5) -> List[str]:
        return await self._backend.search(user_id=user_id, query=query, limit=limit)




