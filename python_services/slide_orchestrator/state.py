"""State definitions and reducers for the Slide Orchestrator LangGraph workflow."""

from __future__ import annotations

from typing import Annotated, Dict, List, Sequence, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

# ---------------------------------------------------------------------------
# TypedDict representing the shared state that flows through the LangGraph.
# ---------------------------------------------------------------------------

class TeachingAgentState(TypedDict, total=False):
    """Shared state object passed between LangGraph nodes.

    Fields are grouped by pipeline phase; not all keys are required at all times.
    """

    # Core conversation context ------------------------------------------------
    messages: Annotated[Sequence[BaseMessage], add_messages]
    user_query: str
    learning_goal: str

    # Research phase ----------------------------------------------------------
    research_tasks: List[Dict[str, str]]
    research_results: Annotated[Sequence[BaseMessage], add_messages]
    research_outputs: list[dict]  # <-- for actual research result dicts
    content_outputs: list[dict]   # <-- for actual content result dicts
    visual_outputs: list[dict]    # <-- Add this for consistency
    voice_outputs: list[dict]     # <-- Add this for consistency
    sources: List[Dict[str, str]]  # e.g. {"url": str, "title": str}

    # Content generation phase -------------------------------------------------
    curriculum_outline: Dict[str, object]
    slide_contents: List[Dict[str, object]]
    # visual_assets: Dict[str, str]  # asset_id -> URL or base64 (remove or comment out if not used)

    # Slide assembly phase -----------------------------------------------------
    deck_json: Dict[str, object]
    speaker_notes: List[str]

    # Voice synthesis phase ----------------------------------------------------
    audio_tasks: List[Dict[str, str]]  # slide_id, text
    audio_urls: Dict[str, str]  # slide_id -> audio URL

    # Control & meta -----------------------------------------------------------
    current_phase: str  # research | content | assembly | voice | complete
    iteration_count: int
    error_log: List[str]
    current_objective: str  # <-- Add this line
    final_deck: list[dict]  # <-- Add this line for explicit type-hinting


# ---------------------------------------------------------------------------
# Helper initialiser ---------------------------------------------------------
# ---------------------------------------------------------------------------


def initial_state(user_query: str, learning_goal: str) -> TeachingAgentState:
    """Return a minimally populated initial state dictionary."""
    return TeachingAgentState(  # type: ignore[call-arg]
        messages=[],
        user_query=user_query,
        learning_goal=learning_goal,
        research_tasks=[],
        research_results=[],
        research_outputs=[],
        content_outputs=[],
        visual_outputs=[],
        voice_outputs=[],
        sources=[],
        curriculum_outline={},
        slide_contents=[],
        deck_json={},
        speaker_notes=[],
        audio_tasks=[],
        audio_urls={},
        current_phase="research",
        iteration_count=0,
        error_log=[],
        current_objective=f"Conduct foundational research on {learning_goal}.",
    ) 