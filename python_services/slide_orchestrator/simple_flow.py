"""Minimal two-slide teaching flow (planner + worker) with external plan memory.

- Orchestrator: generates and stores a concise plan for creating a short lesson
  and emits a plan event so the UI can reflect intent.
- Worker: generates exactly two slides (text + speaker notes) and synthesizes
  voice for each slide, yielding streamable slide events.

This flow intentionally ignores research and visuals to reduce complexity.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Tuple

from shared.llm_client import get_llm_client
from shared.models import ConversationMessage, MessageRole, LLMProvider
from .shared_memory import memory_table, append_event


def _default_two_slides(learning_goal: str) -> List[Dict[str, Any]]:
    """Deterministic fallback slides when LLM is unavailable."""
    return [
        {
            "id": str(uuid.uuid4()),
            "slide_number": 1,
            "type": "title",
            "layout": "full_text",
            "title": f"Introduction to {learning_goal}",
            "contents": [
                {"type": "text", "text": f"What you will learn about {learning_goal}"}
            ],
            "speaker_notes": f"Welcome! In this short lesson, we'll cover the essentials of {learning_goal}.",
            "duration_seconds": 20.0,
            "sources": [],
            "requires_interaction": False,
            "difficulty_level": "medium",
            "can_skip": True,
            "prerequisites": [],
            "auto_advance": True,
            "renderCode": _build_render_code_tsx(),
        },
        {
            "id": str(uuid.uuid4()),
            "slide_number": 2,
            "type": "content",
            "layout": "bullet_points",
            "title": f"Core ideas of {learning_goal}",
            "contents": [
                {"type": "bullet", "text": "Definition and why it matters"},
                {"type": "bullet", "text": "Key components or steps"},
                {"type": "bullet", "text": "A simple example to remember"},
            ],
            "speaker_notes": f"First, a clear definition of {learning_goal}. Then the core pieces, and a tiny example so you can apply it right away.",
            "duration_seconds": 40.0,
            "sources": [],
            "requires_interaction": False,
            "difficulty_level": "medium",
            "can_skip": True,
            "prerequisites": [],
            "auto_advance": True,
            "renderCode": _build_render_code_tsx(),
        },
    ]


async def generate_and_store_plan(*, session_id: str | None, learning_goal: str) -> Dict[str, Any]:
    """Create a concise plan and store it in external memory keyed by session.

    The plan persists to avoid context loss over long interactions, following
    best practices for multi-agent research/orchestration.
    """
    plan: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "title": f"Two-slide mini-lesson for {learning_goal}",
        "steps": [
            {"id": "plan-1", "title": "Draft exactly two slides (title + key ideas)", "success_criteria": ["2 slides", "concise", "clear speaker notes"]},
            {"id": "plan-2", "title": "Synthesize narration for each slide", "success_criteria": ["natural voice", "<= 60s total"]},
            {"id": "plan-3", "title": "Stream slides and audio to UI", "success_criteria": ["slide events", "audio URLs ready"]},
        ],
        "notes": "Keep it simple and engaging. No research/images in this mode.",
    }

    key = f"plan:{session_id}" if session_id else f"plan:{plan['id']}"
    with memory_table("plans") as db:
        db[key] = plan

    try:
        append_event({"type": "plan_saved", "payload": {"key": key, "title": plan["title"]}})
    except Exception:
        pass
    return plan


async def generate_two_slides_via_llm(learning_goal: str) -> List[Dict[str, Any]]:
    """Use Anthropic via the unified client to draft two slides as JSON."""
    client = get_llm_client()
    system = (
        "You are an expert teaching assistant. Create exactly two concise slides for the given topic. "
        "Return ONLY valid JSON with an array 'slides' of length 2. Each slide must include: "
        "id (uuid), slide_number (1-based), type ('title' or 'content'), layout ('full_text' or 'bullet_points'), "
        "title (string), contents (array of {type:'text'|'bullet', text:string}), speaker_notes (string), duration_seconds (number)."
    )
    user = f"Topic: {learning_goal}\nConstraints: two slides only; short, engaging; no images; high-quality speaker notes."
    messages = [
        ConversationMessage(role=MessageRole.SYSTEM, content=system),
        ConversationMessage(role=MessageRole.USER, content=user),
    ]

    try:
        raw, _used = await client.generate_response(
            messages,
            preferred_provider=LLMProvider.ANTHROPIC,
            max_tokens=1200,
            temperature=0.6,
            model="claude-3-7-sonnet-20250219",
            allow_fallback=False,
        )
        text = raw.strip()
        # Extract JSON if wrapped in code fences
        if text.startswith("```"):
            fence = text.split("\n", 1)[0].strip("`").strip()
            body = text[len(text.split("\n", 1)[0]) + 1 :]
            if body.endswith("```"):
                body = body[: -3]
            text = body
        data = json.loads(text)
        slides = data.get("slides") or data
        if not isinstance(slides, list) or len(slides) != 2:
            raise ValueError("Expected exactly 2 slides")
        # Ensure minimal required fields exist
        for idx, s in enumerate(slides, start=1):
            s.setdefault("id", str(uuid.uuid4()))
            s["slide_number"] = idx
            s.setdefault("type", "content")
            s.setdefault("layout", "bullet_points")
            s.setdefault("title", f"Slide {idx}: {learning_goal}")
            s.setdefault("contents", [{"type": "text", "text": learning_goal}])
            s.setdefault("speaker_notes", f"Key points about {learning_goal}.")
            s.setdefault("duration_seconds", 30.0)
            s["renderCode"] = _build_render_code_tsx()
        return slides
    except Exception:
        return _default_two_slides(learning_goal)


def _build_render_code_tsx() -> str:
    """TSX template used by the frontend runtime to render slides from props.slide."""
    return (
        "export default function Slide(props){\n"
        "  const { slide, showCaptions } = props;\n"
        "  const textItems = (slide.contents || []).filter(c => c && (c.type === 'text' || c.type === 'bullet_list' || c.type === 'bullet'));\n"
        "  const bullets = [];\n"
        "  textItems.forEach(c => { if (c.type === 'bullet_list' && Array.isArray(c.value)) bullets.push(...c.value); if (c.type === 'bullet' && c.text) bullets.push(c.text); });\n"
        "  const mainText = textItems.find(c => c.type === 'text');\n"
        "  return (\n"
        "    <View style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 24 }}>\n"
        "      {slide.title ? (<Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>{slide.title}</Text>) : null}\n"
        "      <View style={{ flex: 1 }}>\n"
        "        {mainText ? (<Text style={{ color: '#e5e7eb', fontSize: 16, lineHeight: 24 }}>{mainText.value || mainText.text}</Text>) : null}\n"
        "        {bullets.length ? bullets.map((b, i) => (<View key={'b'+i} style={{ flexDirection: 'row', marginTop: 8 }}><Text style={{ color: '#10b981', marginRight: 8 }}>•</Text><Text style={{ color: '#e5e7eb', flex: 1 }}>{String(b)}</Text></View>)) : null}\n"
        "      </View>\n"
        "      {showCaptions && slide.speaker_notes ? (<View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10 }}><Text style={{ color: '#fff', fontSize: 12 }}>{slide.speaker_notes}</Text></View>) : null}\n"
        "    </View>\n"
        "  );\n"
        "}\n"
    )






