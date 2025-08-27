"""Tool registry and adapters around existing agents to enable supervisor tool-calling.

This module provides a minimal, strongly-typed tool interface that wraps the
current task-table semantics. Tools create pending tasks in shared memory and
emit streaming events, which are then picked up by the existing worker agents
(`ResearchAgent`, `ContentDraftingAgent`, `VisualDesignerAgent`, `VoiceSynthesisAgent`).

The goal is to let a planner/supervisor decide which tools to invoke without
introducing hardcoded boolean flags; decisions are made contextually.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
import time
import uuid

from .shared_memory import memory_table, append_event


@dataclass
class ToolCall:
    name: str
    args: Dict[str, Any]


@dataclass
class ToolResult:
    ok: bool
    result: Optional[Dict[str, Any]] = None
    confidence: float = 0.7
    cost: float = 0.0
    duration_ms: int = 0
    error: Optional[str] = None


class Tool:
    def __init__(self, name: str, runner: Callable[[Dict[str, Any]], ToolResult]) -> None:
        self.name = name
        self._runner = runner

    async def __call__(self, args: Dict[str, Any]) -> ToolResult:
        start = time.time()
        try:
            result = self._runner(args)
            result.duration_ms = int((time.time() - start) * 1000)
            return result
        except Exception as e:  # noqa: BLE001
            return ToolResult(ok=False, error=str(e), duration_ms=int((time.time() - start) * 1000))


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def has(self, name: str) -> bool:
        return name in self._tools

    async def call(self, call: ToolCall) -> ToolResult:
        tool = self._tools.get(call.name)
        if not tool:
            return ToolResult(ok=False, error=f"Unknown tool: {call.name}")
        # Emit tool_start event
        append_event({
            "type": "tool_start",
            "payload": {"tool": call.name, "args": call.args},
        })
        result = await tool(call.args)
        append_event({
            "type": "tool_end",
            "payload": {
                "tool": call.name,
                "ok": result.ok,
                "duration_ms": result.duration_ms,
                "error": result.error,
            },
        })
        return result


def _register_visual_tools(registry: ToolRegistry) -> None:
    def _enqueue_visual_task(args: Dict[str, Any], visual_kind: str) -> ToolResult:
        task_id = str(uuid.uuid4())
        objective = args.get("objective") or f"Create {visual_kind} to improve comprehension"
        learning_goal = args.get("learning_goal") or ""
        slide_number = args.get("slide_number")
        with memory_table("visual_tasks") as db:
            db[task_id] = {
                "id": task_id,
                "status": "pending",
                "objective": objective,
                "learning_goal": learning_goal,
                "visual_types": [visual_kind],
                **({"slide_number": slide_number} if slide_number is not None else {}),
                "created_at": time.time(),
            }
        append_event({
            "type": "decision",
            "payload": {"action": "enqueue_visual", "visual_kind": visual_kind, "task_id": task_id, "slide_number": slide_number},
        })
        return ToolResult(ok=True, result={"task_id": task_id})

    registry.register(Tool("visuals.generate_diagram", lambda args: _enqueue_visual_task(args, "diagrams")))
    registry.register(Tool("visuals.generate_image", lambda args: _enqueue_visual_task(args, "images")))


def _register_voice_tools(registry: ToolRegistry) -> None:
    def _enqueue_voice_task(args: Dict[str, Any]) -> ToolResult:
        slide_number = args.get("slide_number")
        if slide_number is None:
            return ToolResult(ok=False, error="slide_number is required for voice.synthesize")
        # Avoid duplicates
        with memory_table("voice_tasks") as db:
            for existing in db.values():
                if existing.get("slide_number") == slide_number and existing.get("status") in ("pending", "in_progress"):
                    return ToolResult(ok=True, result={"task_id": existing.get("id"), "deduped": True})
        # Build from content slide speaker_notes if not provided
        speaker_notes = args.get("speaker_notes")
        if speaker_notes is None:
            with memory_table("content_tasks") as cdb:
                for rec in cdb.values():
                    for s in rec.get("slides", []) or []:
                        if s.get("slide_number") == slide_number:
                            speaker_notes = s.get("speaker_notes")
                            break
        if not speaker_notes:
            return ToolResult(ok=False, error="speaker_notes not found for the specified slide")
        task_id = str(uuid.uuid4())
        with memory_table("voice_tasks") as db:
            db[task_id] = {
                "id": task_id,
                "status": "pending",
                "objective": f"Generate voice for slide {slide_number}",
                "slide_number": slide_number,
                "speaker_notes": speaker_notes,
                "created_at": time.time(),
            }
        append_event({
            "type": "decision",
            "payload": {"action": "enqueue_voice", "task_id": task_id, "slide_number": slide_number},
        })
        return ToolResult(ok=True, result={"task_id": task_id})

    registry.register(Tool("voice.synthesize", _enqueue_voice_task))


def _register_noop_slides_tool(registry: ToolRegistry) -> None:
    # Leave room for future per-slide updates (e.g., difficulty, hints)
    def _slides_update(args: Dict[str, Any]) -> ToolResult:
        slide_number = args.get("slide_number")
        fields = args.get("fields") or {}
        if slide_number is None or not isinstance(fields, dict):
            return ToolResult(ok=False, error="slide_number and fields dict are required")
        updated = False
        with memory_table("content_tasks") as cdb:
            for tid, rec in cdb.items():
                slides = rec.get("slides", []) or []
                for s in slides:
                    if s.get("slide_number") == slide_number:
                        s.update(fields)
                        try:
                            s["version"] = int(s.get("version", 0)) + 1
                        except Exception:
                            s["version"] = 1
                        cdb[tid] = rec
                        updated = True
                        break
        if not updated:
            return ToolResult(ok=False, error="Slide not found")
        append_event({
            "type": "decision",
            "payload": {"action": "slides.update", "slide_number": slide_number},
        })
        return ToolResult(ok=True, result={"slide_number": slide_number})

    registry.register(Tool("slides.update", _slides_update))


_GLOBAL_REGISTRY: Optional[ToolRegistry] = None


def get_tool_registry() -> ToolRegistry:
    global _GLOBAL_REGISTRY
    if _GLOBAL_REGISTRY is None:
        reg = ToolRegistry()
        _register_visual_tools(reg)
        _register_voice_tools(reg)
        _register_noop_slides_tool(reg)
        _GLOBAL_REGISTRY = reg
    return _GLOBAL_REGISTRY



