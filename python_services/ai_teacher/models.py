from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


EventType = Literal["render", "speak", "meta", "final", "error", "heartbeat", "session"]


class RenderPayload(BaseModel):
    # A short title for the current teaching segment
    title: Optional[str] = None
    # Human-readable markdown that summarizes what is being shown
    markdown: Optional[str] = None
    # Optional code to be rendered by the frontend runtime (TSX/JSX or diagram specs)
    code: Optional[str] = None
    # Optional code language hint: "tsx" | "jsx" | "mermaid" | "plain"
    language: Optional[str] = Field(default="tsx")
    # Optional hints to the client runtime (e.g., progressive reveals)
    runtime_hints: Optional[Dict[str, Any]] = None
    # Optional simple timeline the UI/runtime can use for synchronized reveals/animations
    timeline: Optional[List[Dict[str, Any]]] = None  # e.g., [{"at": 0, "event": "intro"}, {"at": 6, "event": "reveal:bullets"}]


class SpeakSegment(BaseModel):
    text: str
    audio_url: Optional[str] = None
    start_at: float = 0.0
    duration_seconds: Optional[float] = None


class SpeakPayload(BaseModel):
    # Narration text (teacher voice)
    text: str
    # If synthesized, a URL to the audio file served by backend
    audio_url: Optional[str] = None
    # Optional duration in seconds if available
    duration_seconds: Optional[float] = None
    # Voice metadata
    voice: Optional[str] = None
    model: Optional[str] = None
    # Optional start offset in seconds relative to the visual timeline
    start_at: Optional[float] = None
    # Optional segmented TTS for tighter sync
    segments: Optional[List[SpeakSegment]] = None
    # Optional per-word timestamps for fine-grained sync
    # Each item is {"word": str, "start": float, "end": float}
    word_timestamps: Optional[List[Dict[str, Any]]] = None


class MetaPayload(BaseModel):
    # Arbitrary metadata updates about the session/lesson
    data: Dict[str, Any] = Field(default_factory=dict)


class TeacherEvent(BaseModel):
    type: EventType
    session_id: Optional[str] = None
    seq: Optional[int] = None
    render: Optional[RenderPayload] = None
    speak: Optional[SpeakPayload] = None
    meta: Optional[MetaPayload] = None
    message: Optional[str] = None  # for error/heartbeat/info


class StartSessionRequest(BaseModel):
    topic: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    # Optional: teaching options
    preferred_voice: Optional[str] = None
    language: Optional[str] = None


class StreamLessonRequest(BaseModel):
    topic: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    # When true, synthesize TTS audio; otherwise emit speak.text only
    tts: bool = True
    preferred_voice: Optional[str] = None
    language: Optional[str] = None
    # Optional: allow model override; defaults to GPT-5
    model: Optional[str] = None


class RenderErrorReport(BaseModel):
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    topic: Optional[str] = None
    code: str
    error: str
    timeline: Optional[List[Dict[str, Any]]] = None
    platform: Optional[str] = None


