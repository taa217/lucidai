# D:\Projects\Lucid\python_services\slide_orchestrator\communication.py

"""Inter-agent communication helpers (Phase 2.6)."""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List

from .shared_memory import memory_table


Message = Dict[str, Any]


def _now() -> float:  # helper for timestamp
    return time.time()


def send_message(sender: str, receiver: str, msg_type: str, payload: Any) -> str:
    """Persist a message for *receiver* and return message id."""

    msg_id = str(uuid.uuid4())
    msg: Message = {
        "id": msg_id,
        "ts": _now(),
        "sender": sender,
        "receiver": receiver,
        "type": msg_type,
        "payload": payload,
        "status": "unread",
    }
    with memory_table("messages") as db:
        db[msg_id] = msg
    return msg_id


def fetch_messages(agent_name: str, mark_read: bool = True) -> List[Message]:
    """Return unread messages addressed to *agent_name*."""
    msgs: List[Message] = []
    with memory_table("messages") as db:
        for mid, meta in db.items():
            if meta.get("receiver") == agent_name and meta.get("status") == "unread":
                msgs.append(meta)
                if mark_read:
                    # This line had a small bug, corrected here to update the dictionary value
                    meta['status'] = 'read'
                    db[mid] = meta
    return msgs