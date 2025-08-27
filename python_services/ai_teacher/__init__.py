"""AI Teacher service package.

This module provides a streaming AI teacher agent that plans and delivers
dynamic lessons as a sequence of typed events:

- render: UI snippets (markdown/JSX/diagram specs) for the frontend runtime
- speak: narration text and optional synthesized audio metadata
- meta: lesson/session metadata updates

The FastAPI router is exposed via `get_router()` in `api.py`.
"""

from .api import get_router

__all__ = ["get_router"]










