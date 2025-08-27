"""Shared memory store for agent coordination.

Phase 1.5 — lightweight persistence with sqlitedict.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlitedict import SqliteDict

MEMORY_DB_PATH = Path(__file__).with_suffix(".sqlite")


@contextmanager
def memory_table(table_name: str) -> Iterator[SqliteDict]:
    """Context manager returning a SqliteDict table for shared memory.

    Usage:
        with memory_table("research") as db:
            db["task_id"] = {"status": "done"}
    """

    with SqliteDict(str(MEMORY_DB_PATH), tablename=table_name, autocommit=True) as db:
        yield db 


def append_event(event: dict) -> int:
    """Append an event to the 'events' table with a monotonically increasing sequence number.

    Returns the assigned sequence number.
    """
    # Allocate next sequence number in system_state
    with memory_table("system_state") as sysdb:
        try:
            current = int(sysdb.get("events_seq", 0))
        except Exception:
            current = 0
        seq = current + 1
        sysdb["events_seq"] = seq

    # Store event
    record = dict(event)
    record["seq"] = seq
    with memory_table("events") as evdb:
        evdb[str(seq)] = record
    return seq