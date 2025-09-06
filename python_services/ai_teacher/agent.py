from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator, Optional, List

from .models import TeacherEvent, RenderPayload, SpeakPayload, StreamLessonRequest, SpeakSegment
from .state import session_state
from shared.llm_client import get_llm_client, LLMProvider
from shared.voice_client import synthesize_cartesia_tts


OPENAI_GPT5_MODEL = os.environ.get("OPENAI_TEACHER_MODEL", "gpt-5-2025-08-07")


class TeacherAgent:
    """Minimal AI Teacher that plans and emits a sequence of render/speak events.

    Iteration 1 behavior:
      - Use GPT‑5 to produce a short outline and the first teaching segment.
      - Emit a render block with TSX code and a speak block with narration.
      - Optionally synthesize audio via OpenAI Voices and attach audio_url.
    """

    def __init__(self) -> None:
        self.llm = get_llm_client()

    async def stream_lesson(self, req: StreamLessonRequest) -> AsyncGenerator[TeacherEvent, None]:
        # Prepare session
        session_id = req.session_id or f"teacher_{req.user_id or 'anon'}"
        state = session_state.ensure(session_id)
        state["topic"] = req.topic
        state["user_id"] = req.user_id

        # Announce session
        yield TeacherEvent(type="session", session_id=session_id, message="session started", seq=session_state.next_seq(session_id))

        # Build planning prompt
        system = (
            "You are a master teacher. Develop and deliver a dynamic teaching segment that feels like a live, paced teaching video. "
            "Return TWO sections only: narration and TSX code. The visuals MUST be React-friendly and sync to audio beats. "
            "RUNTIME CONTRACT (STRICT):\n"
            "- Environment: React web runtime with Babel (no bundler).\n"
            "- Allowed elements ONLY: div, span, p, h1, h2, h3, img, button, svg, rect, circle, line, path, text.\n"
            "- Props available to your component: { slide, showCaptions, isPlaying, timeSeconds, timeline }.\n"
            "- Use inline styles only (backgroundColor, color, fontSize, padding, margin, etc.).\n"
            "- NO imports, NO require, NO external libraries, NO hooks beyond JSX itself.\n"
            "- DO NOT use React Native primitives like View/Text/Image.\n"
            "- CRITICAL: Use stable keys and avoid dynamic component creation to prevent React errors.\n"
            "SYNC REQUIREMENTS:\n"
            "- Use timeSeconds (float, seconds) and timeline (array of { at:number, event:string }) to reveal beats.\n"
            "- Compute booleans like showIntro/showBeat2 by comparing timeSeconds against timeline thresholds.\n"
            "- Aim for 3–5 beats (intro + reveals). Each beat should add/change visuals (e.g., fade in title, highlight, simple diagram).\n"
            "- Keep under ~90 lines.\n"
            "- Use CSS transitions instead of complex animations to prevent render conflicts.\n"
            "TONE: The learner is Clyde; keep it cool and encouraging."
        )
        user = (
            f"Topic: {req.topic}\n"
            "Audience: motivated beginner.\n"
            "Goal: explain the core idea with one concrete example and a simple visual layout.\n"
            "Constraints: 120-180 words narration; TSX under ~80 lines; no external fetches."
        )

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        # Ask GPT‑5 to return a clear delimiter between narration and TSX
        prompt = (
            "Return in this exact format:\n\n"
            "Narration:\n"
            "<narration>...teacher speaking text...</narration>\n\n"
            "Code:\n"
            "```tsx\nfunction Lesson({ slide, showCaptions, isPlaying, timeSeconds, timeline }) {\n"
            "  // Compute which timeline events have fired\n"
            "  const fired = new Set((timeline || []).filter(t => (t?.at ?? 0) <= (timeSeconds || 0)).map(t => t.event));\n"
            "  const showIntro = fired.has('intro') || fired.size === 0;\n"
            "  const beat2 = Array.from(fired).some(e => (e||'').includes('reveal:1') || (e||'').includes('reveal:main'));\n"
            "  const beat3 = Array.from(fired).some(e => (e||'').includes('reveal:2'));\n"
            "  const beat4 = Array.from(fired).some(e => (e||'').includes('reveal:3'));\n"
            "  return (\n"
            "    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, Arial, sans-serif' }}>\n"
            "      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>{slide?.title || 'Lesson'}</h1>\n"
            "      {showIntro ? (<p style={{ opacity: 0.95 }}>Let\u2019s begin…</p>) : null}\n"
            "      <div style={{ marginTop: 16 }}>\n"
            "        <svg width='100%' height='220' viewBox='0 0 800 220'>\n"
            "          <rect x='0' y='0' width='800' height='220' fill='#0b1220' stroke='#1f2a44' />\n"
            "          <circle cx='120' cy='110' r='38' fill={beat2 ? '#22c55e' : '#334155'} />\n"
            "          <rect x='200' y='72' width={beat3 ? 420 : 180} height='28' rx='6' fill='#334155' />\n"
            "          <rect x='200' y='112' width={beat4 ? 360 : 140} height='24' rx='6' fill='#1f2a44' />\n"
            "        </svg>\n"
            "      </div>\n"
            "    </div>\n"
            "  );\n"
            "}\n\n"
            "// Export the component for the runtime\n"
            "module.exports = Lesson;\n"
            "```\n"
            "Guidance: 120–180 words. Use ONLY basic HTML/SVG. Use timeSeconds/timeline for beat reveals. IMPORTANT: Use 'function Lesson(...)' (not export default) and end with 'module.exports = Lesson;'. Do NOT use React Native components."
        )
        messages.append({"role": "user", "content": prompt})

        # Generate using OpenAI only (no fallback) and GPT‑5 by default
        text, _provider = await self.llm.generate_response(
            messages=[type("Msg", (), {"role": type("Role", (), {"value": m["role"]}), "content": m["content"]}) for m in messages],
            preferred_provider=LLMProvider.OPENAI,
            model=req.model or OPENAI_GPT5_MODEL,
            allow_fallback=False,
            max_tokens=2048,
            temperature=0.7,
        )

        narration = self._extract_tag(text, "narration") or text.strip()[:220]
        code = self._extract_code_block(text) or (
            "function Lesson({ slide, showCaptions, isPlaying, timeSeconds, timeline }) {\n"
            "  // Stable computation to prevent re-render issues\n"
            "  const timelineArray = timeline || [];\n"
            "  const currentTime = timeSeconds || 0;\n"
            "  const fired = new Set(timelineArray.filter(t => (t?.at ?? 0) <= currentTime).map(t => t.event));\n"
            "  const showIntro = fired.has('intro') || fired.size === 0;\n"
            "  const beat2 = Array.from(fired).some(e => (e||'').includes('reveal:1') || (e||'').includes('reveal:main'));\n"
            "  const beat3 = Array.from(fired).some(e => (e||'').includes('reveal:2'));\n"
            "  const beat4 = Array.from(fired).some(e => (e||'').includes('reveal:3'));\n"
            "  \n"
            "  return (\n"
            "    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, Arial, sans-serif' }}>\n"
            "      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>{slide?.title || 'Lesson'}</h1>\n"
            "      {showIntro ? (<p style={{ opacity: 0.95, transition: 'opacity 0.3s ease' }}>Preparing interactive lesson…</p>) : null}\n"
            "      <div style={{ marginTop: 16 }}>\n"
            "        <svg width='100%' height='220' viewBox='0 0 800 220'>\n"
            "          <rect x='0' y='0' width='800' height='220' fill='#0b1220' stroke='#1f2a44' />\n"
            "          <circle cx='120' cy='110' r='38' fill={beat2 ? '#22c55e' : '#334155'} style={{ transition: 'fill 0.3s ease' }} />\n"
            "          <rect x='200' y='72' width={beat3 ? 420 : 180} height='28' rx='6' fill='#334155' style={{ transition: 'width 0.3s ease' }} />\n"
            "          <rect x='200' y='112' width={beat4 ? 360 : 140} height='24' rx='6' fill='#1f2a44' style={{ transition: 'width 0.3s ease' }} />\n"
            "        </svg>\n"
            "      </div>\n"
            "    </div>\n"
            "  );\n"
            "}\n\n"
            "module.exports = Lesson;"
        )

        # Persist last outputs for auto-fix context
        try:
            state["last_generation"] = {
                "narration": narration,
                "code": code,
                "model": req.model or OPENAI_GPT5_MODEL,
            }
        except Exception:
            pass

        # Emit render first so UI can show content while TTS processes
        # Use a basic timeline that will be updated after TTS processing
        yield TeacherEvent(
            type="render",
            session_id=session_id,
            seq=session_state.next_seq(session_id),
            render=RenderPayload(
                title=f"Lesson: {req.topic}",
                markdown=None,
                code=code,
                language="tsx",
                runtime_hints={"progressive": True},
                timeline=[{"at": 0, "event": "intro"}],  # Start with just intro, will be updated with precise timing
            ),
        )

        speak_payload = SpeakPayload(text=narration, start_at=0)
        if req.tts:
            try:
                # Cartesia TTS with word timestamps
                result_full = await synthesize_cartesia_tts(
                    narration,
                    voice_id=(req.preferred_voice or os.environ.get("CARTESIA_VOICE_ID")),
                    model_id=os.environ.get("CARTESIA_TTS_MODEL", "sonic-2"),
                    language=(req.language or os.environ.get("CARTESIA_LANGUAGE", "en")),
                    format=os.environ.get("CARTESIA_AUDIO_FORMAT", "mp3"),
                    filename_prefix=f"teacher_{session_id}",
                    add_timestamps=True,
                    speed=os.environ.get("CARTESIA_SPEED", "normal"),
                )
                speak_payload.audio_url = result_full.get("public_url")
                speak_payload.duration_seconds = result_full.get("duration_seconds")
                speak_payload.model = result_full.get("model")
                speak_payload.voice = result_full.get("voice")
                speak_payload.word_timestamps = result_full.get("word_timestamps")

                segments: List[SpeakSegment] = []
                timeline_events = []
                if speak_payload.word_timestamps:
                    words = speak_payload.word_timestamps
                    # Aim for ~4 beats for better visual progression
                    num_beats = 4 if len(words) >= 28 else (3 if len(words) >= 14 else 2)
                    per = max(1, round(len(words) / num_beats))
                    idx = 0
                    beat_no = 1
                    while idx < len(words):
                        chunk = words[idx:idx+per]
                        text_chunk = " ".join([w.get("word", "") for w in chunk]).strip()
                        start = float(chunk[0].get("start", 0.0))
                        end = float(chunk[-1].get("end", start))
                        seg = SpeakSegment(text=text_chunk, start_at=round(start, 2), duration_seconds=round(max(0.2, end - start), 2))
                        segments.append(seg)
                        # Use more descriptive event names for better visual coordination
                        if beat_no == 1:
                            timeline_events.append({"at": round(start, 2), "event": "reveal:main"})
                        else:
                            timeline_events.append({"at": round(start, 2), "event": f"reveal:{beat_no}"})
                        beat_no += 1
                        idx += per
                else:
                    # Fallback to naive sentence beats with better timing
                    total_duration = speak_payload.duration_seconds or max(8.0, len(narration.split()) * 0.62)
                    import re
                    raw = [s.strip() for s in re.split(r"(?<=[\.!?])\s+", narration) if s.strip()]
                    if not raw:
                        raw = [narration]
                    if len(raw) > 5:
                        target = 4
                        per2 = max(1, round(len(raw) / target))
                        beats = [" ".join(raw[i:i+per2]) for i in range(0, len(raw), per2)]
                    else:
                        beats = raw
                    beat_dur = max(1.5, total_duration / max(1, len(beats)))
                    t = 0.0
                    for i, segment_text in enumerate(beats, start=1):
                        seg = SpeakSegment(text=segment_text, start_at=round(t, 2), duration_seconds=round(beat_dur, 2))
                        segments.append(seg)
                        # Use more descriptive event names
                        if i == 1:
                            timeline_events.append({"at": round(t, 2), "event": "reveal:main"})
                        else:
                            timeline_events.append({"at": round(t, 2), "event": f"reveal:{i}"})
                        t += beat_dur

                speak_payload.segments = segments
                # Emit an updated render with precise timeline aligned to voice
                yield TeacherEvent(
                    type="render",
                    session_id=session_id,
                    seq=session_state.next_seq(session_id),
                    render=RenderPayload(
                        title=f"Lesson: {req.topic}",
                        markdown=None,
                        code=code,
                        language="tsx",
                        runtime_hints={"progressive": True, "beats": len(segments)},
                        timeline=[{"at": 0, "event": "intro"}] + timeline_events,
                    ),
                )
            except Exception:
                pass

        yield TeacherEvent(
            type="speak",
            session_id=session_id,
            seq=session_state.next_seq(session_id),
            speak=speak_payload,
        )

        # Final signal (iteration 1 ends here)
        yield TeacherEvent(type="final", session_id=session_id, seq=session_state.next_seq(session_id), message="lesson segment complete")

    @staticmethod
    def _extract_tag(text: str, tag: str) -> Optional[str]:
        import re
        m = re.search(rf"<\s*{tag}[^>]*>([\s\S]*?)<\s*/\s*{tag}\s*>", text, flags=re.IGNORECASE)
        return m.group(1).strip() if m else None

    @staticmethod
    def _extract_code_block(text: str) -> Optional[str]:
        import re
        # Support CRLF newlines and optional language in fences
        m = re.search(r"```(?:tsx|jsx)?\r?\n([\s\S]*?)\r?\n```", text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
        # If the whole text is just a fenced block, strip fences
        m2 = re.match(r"^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```\s*$", text.strip(), flags=re.IGNORECASE)
        if m2:
            return m2.group(1).strip()
        return None


