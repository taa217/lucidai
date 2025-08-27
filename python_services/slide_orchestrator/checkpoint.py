"""Checkpoint utilities for persisting graph state between runs."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

from .state import TeachingAgentState

CHECKPOINT_DIR = Path(__file__).parent / "_checkpoints"
CHECKPOINT_DIR.mkdir(exist_ok=True)


def _cp_path(run_id: str) -> Path:
    return CHECKPOINT_DIR / f"{run_id}.json"


def save_checkpoint(run_id: str, state: TeachingAgentState) -> None:
    """Write current state to disk as JSON."""
    payload = {
        "timestamp": time.time(),
        "state": state,
    }
    _cp_path(run_id).write_text(json.dumps(payload, default=str))


def load_checkpoint(run_id: str) -> Optional[TeachingAgentState]:
    """Return last saved state or None if not found."""
    path = _cp_path(run_id)
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return data.get("state")  # type: ignore[return-value] 