from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator, Optional, List, Dict, Any
import httpx

from .models import TeacherEvent, RenderPayload, SpeakPayload, StreamLessonRequest, SpeakSegment
from .state import session_state
from shared.llm_client import get_llm_client, LLMProvider
from shared.voice_client import synthesize_cartesia_tts
from shared.config import get_settings
from .tsx_utils import extract_tag as tsx_extract_tag, extract_code_block as tsx_extract_code_block, normalize_tsx as tsx_normalize
from .timeline_utils import build_segments_from_word_timestamps, build_segments_naive
from .user_prefs import fetch_user_customizations as fetch_prefs
from .tsx_utils import extract_tag as tsx_extract_tag, extract_code_block as tsx_extract_code_block, normalize_tsx as tsx_normalize
from .timeline_utils import build_segments_from_word_timestamps, build_segments_naive
from .user_prefs import fetch_user_customizations as fetch_prefs


OPENAI_GPT5_MODEL = os.environ.get("OPENAI_TEACHER_MODEL", "gpt-5-codex")


class TeacherAgent:
    """Minimal AI Teacher that plans and emits a sequence of render/speak events.

    Iteration 1 behavior:
      - Use GPT‑5 to produce a short outline and the first teaching segment.
      - Emit a render block with TSX code and a speak block with narration.
      - Optionally synthesize audio via OpenAI Voices and attach audio_url.
    """

    def __init__(self) -> None:
        self.llm = get_llm_client()

    async def fetch_user_customizations(self, user_id: Optional[str] = None, auth_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch user customizations from the main server API."""
        if not user_id:
            return None

        settings = get_settings()
        main_server_url = settings.main_server_url

        try:
            # Prepare headers
            headers = {
                "Content-Type": "application/json",
            }

            # Add authentication if token is provided
            if auth_token:
                headers["Authorization"] = f"Bearer {auth_token}"

            # Make request to the main server API
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(
                    f"{main_server_url}/api/users/customize",
                    headers=headers
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success") and data.get("data"):
                        return data["data"]
                else:
                    print(f"Failed to fetch user customizations: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"Error fetching user customizations: {e}")

        return None

    async def stream_lesson(self, req: StreamLessonRequest) -> AsyncGenerator[TeacherEvent, None]:
        try:
            print(f"[TeacherAgent] stream_lesson start topic='{req.topic}' user='{req.user_id}' session='{req.session_id}' tts={req.tts}")
        except Exception:
            pass
        # Prepare session
        session_id = req.session_id or f"teacher_{req.user_id or 'anon'}"
        state = session_state.ensure(session_id)
        state["topic"] = req.topic
        state["user_id"] = req.user_id

        # Fetch user customizations for personalized teaching
        user_customizations = await self.fetch_user_customizations(req.user_id, req.auth_token)
        try:
            print(f"[TeacherAgent] fetched customizations ok={bool(user_customizations)}")
        except Exception:
            pass

        # Announce session
        yield TeacherEvent(type="session", session_id=session_id, message="session started", seq=session_state.next_seq(session_id))

        # Build personalized context for the user
        user_context = ""
        if user_customizations:
            display_name = user_customizations.get("displayName", "Clyde")
            occupation = user_customizations.get("occupation", "")
            traits = user_customizations.get("traits", "")
            extra_notes = user_customizations.get("extraNotes", "")
            preferred_language = user_customizations.get("preferredLanguage", "English")

            user_context = f"LEARNER PROFILE:\n"
            user_context += f"- Name: {display_name}\n"
            if occupation:
                user_context += f"- Occupation: {occupation}\n"
            if traits:
                user_context += f"- Personality traits: {traits}\n"
            if extra_notes:
                user_context += f"- Additional context: {extra_notes}\n"
            if preferred_language and preferred_language != "English":
                user_context += f"- Preferred language: {preferred_language}\n"
            user_context += "\n"

        # Build planning prompt
        system = (
            f"You are a master teacher. Develop and deliver a dynamic teaching segment that feels like a smooth, cinematic YouTube video. "
            f"Return TWO sections only: narration and TSX code. The visuals MUST be React-friendly and feel continuously animated (not just discrete beats). "
            f"{user_context}"
            "RUNTIME CONTRACT (STRICT):\n"
            "- Environment: React web runtime with Babel (no bundler).\n"
            "- Allowed elements ONLY: div, span, p, h1, h2, h3, img, button, svg, rect, circle, line, path, text.\n"
            "- Props available to your component: { slide, showCaptions, isPlaying, timeSeconds, timeline }.\n"
            "- Use inline styles only (backgroundColor, color, fontSize, padding, margin, etc.).\n"
            "- NO imports, NO require, NO external libraries, NO hooks beyond JSX itself.\n"
            "- DO NOT use React Native primitives like View/Text/Image.\n"
            "- CRITICAL: Use stable keys and avoid dynamic component creation to prevent React errors.\n"
            "MOTION HELPERS AVAILABLE (no import needed):\n"
            "- motion.time (alias of timeSeconds), motion.lerp(a,b,t), motion.clamp(x,min,max), motion.easeInOut(t), motion.phaseProgress(phaseIndexOrName).\n"
            "CINEMATICS & SYNC:\n"
            "- Use timeline events as anchors; animate between them using motion.phaseProgress(...).\n"
            "- Keep subtle movement active (parallax blobs, gentle drifts) and use transform-based motion (translate/scale/rotate).\n"
            "- Favor time-driven styles derived from timeSeconds over pure CSS transitions.\n"
            "- Keep TSX under ~120 lines.\n"
            f"TONE: Adapt your teaching style to {user_customizations.get('displayName', 'the learner') if user_customizations else 'the learner'}; keep it cool and encouraging."
        )
        # Get learner's name for personalization
        learner_name = "learner"
        if user_customizations and user_customizations.get("displayName"):
            learner_name = user_customizations["displayName"]

        user = (
            f"Topic: {req.topic}\n"
            f"Audience: {learner_name}, a motivated beginner.\n"
            f"Goal: explain the core idea with one concrete example and a simple visual layout.\n"
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
            "  // Use motion helpers for continuous, time-driven animation\n"
            "  const t = (typeof motion !== 'undefined' && motion.time != null) ? motion.time : (timeSeconds || 0);\n"
            "  const p1 = (typeof motion !== 'undefined' && motion.phaseProgress) ? motion.phaseProgress(1) : 0;\n"
            "  const p2 = (typeof motion !== 'undefined' && motion.phaseProgress) ? motion.phaseProgress(2) : 0;\n"
            "  const ease = (x) => (typeof motion !== 'undefined' && motion.easeInOut ? motion.easeInOut(x) : x);\n"
            "  // Title slides in then gently floats\n"
            "  const titleEnter = ease(Math.min(1, p1));\n"
            "  const titleX = -40 * (1 - titleEnter) + Math.sin(t * 0.4) * 2;\n"
            "  const titleOpacity = 0.25 + 0.75 * titleEnter;\n"
            "  // Bars expand smoothly across phases\n"
            "  const bar1W = 160 + (typeof motion !== 'undefined' ? motion.lerp(0, 260, ease(p1)) : 260 * ease(p1));\n"
            "  const bar2W = 140 + (typeof motion !== 'undefined' ? motion.lerp(0, 220, ease(p2)) : 220 * ease(p2));\n"
            "  // Background drift\n"
            "  const driftX = Math.sin(t * 0.6) * 8;\n"
            "  const driftY = Math.cos(t * 0.5) * 6;\n"
            "  return (\n"
            "    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, Arial, sans-serif' }}>\n"
            "      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#60a5fa', marginBottom: 12, transform: `translateX(${titleX}px)`, opacity: titleOpacity, transition: 'opacity 0.2s linear' }}>{slide?.title || 'Lesson'}</h1>\n"
            "      <div style={{ marginTop: 12 }}>\n"
            "        <svg width='100%' height='220' viewBox='0 0 800 220'>\n"
            "          <rect x='0' y='0' width='800' height='220' fill='#0b1220' stroke='#1f2a44' />\n"
            "          <circle cx={120 + driftX} cy={110 + driftY} r='38' fill='#22c55e' opacity={0.85} />\n"
            "          <rect x='200' y='72' width={bar1W} height='28' rx='6' fill='#334155' />\n"
            "          <rect x='200' y='112' width={bar2W} height='24' rx='6' fill='#1f2a44' />\n"
            "          <text x='200' y='60' fill='#94a3b8' fontSize='14'>Core idea</text>\n"
            "        </svg>\n"
            "      </div>\n"
            "    </div>\n"
            "  );\n"
            "}\n\n"
            "// Export the component for the runtime\n"
            "module.exports = Lesson;\n"
            "```\n"
            "Guidance: 120–180 words. Use ONLY basic HTML/SVG. Favor continuous, timeSeconds-driven transforms with motion.* helpers (phaseProgress, easeInOut, lerp). IMPORTANT: Use 'function Lesson(...)' (not export default) and end with 'module.exports = Lesson;'. Do NOT use React Native components."
        )
        messages.append({"role": "user", "content": prompt})

        # Generate using OpenAI only (no fallback) and GPT‑5 by default
        try:
            print("[TeacherAgent] calling LLM for narration+code…")
        except Exception:
            pass
        text, _provider = await self.llm.generate_response(
            messages=[type("Msg", (), {"role": type("Role", (), {"value": m["role"]}), "content": m["content"]}) for m in messages],
            preferred_provider=LLMProvider.OPENAI,
            model=req.model or OPENAI_GPT5_MODEL,
            allow_fallback=False,
            max_tokens=2048,
            temperature=0.7,
        )
        try:
            preview = (text or "").strip()[:200].replace("\n", " ")
            print(f"[TeacherAgent] LLM response preview: {preview}…")
        except Exception:
            pass

        narration = tsx_extract_tag(text, "narration") or text.strip()[:220]
        extracted = tsx_extract_code_block(text)
        code = (extracted if extracted else (
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
        ))

        # Normalize TSX for bundler-free execution
        try:
            before_len = len(code or "")
            code = tsx_normalize(code)
            after_len = len(code or "")
            head = (code or "")[:140].replace("\n", " ")
            print(f"[TeacherAgent] normalized TSX len {before_len}→{after_len} head='{head}'")
        except Exception as e:
            print(f"[TeacherAgent] normalize TSX failed: {e}")

        # Contract enforcement: if code seems non-compliant or empty, replace with a safe cinematic baseline
        try:
            non_empty = bool(code and isinstance(code, str) and len(code.strip()) > 40)
            has_module_exports = ("module.exports" in (code or ""))
            looks_like_component = ("function " in (code or "") and "return (" in (code or ""))
            if not (non_empty and has_module_exports and looks_like_component):
                from .fixer import generate_safe_cinematic_tsx
                print("[TeacherAgent] code non-compliant → using safe cinematic TSX")
                code = generate_safe_cinematic_tsx(title=f"Lesson: {req.topic}")
        except Exception as _e:
            pass

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
        try:
            print("[TeacherAgent] emit render (initial) + minimal timeline")
        except Exception:
            pass
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
                try:
                    print(f"[TeacherAgent] TTS ok url={speak_payload.audio_url} dur={speak_payload.duration_seconds}s words={len(speak_payload.word_timestamps or [])}")
                except Exception:
                    pass

                segments: List[SpeakSegment] = []
                timeline_events: List[Dict[str, Any]] = []
                if speak_payload.word_timestamps:
                    segs, evs = build_segments_from_word_timestamps(narration, speak_payload.word_timestamps or [])
                else:
                    total_duration = speak_payload.duration_seconds or max(8.0, len(narration.split()) * 0.62)
                    segs, evs = build_segments_naive(narration, float(total_duration))
                for s in segs:
                    segments.append(SpeakSegment(text=s.get("text", ""), start_at=float(s.get("start_at", 0.0)), duration_seconds=float(s.get("duration_seconds", 0.0))))
                timeline_events = evs

                speak_payload.segments = segments
                try:
                    print(f"[TeacherAgent] computed {len(segments)} segments, updating timeline events={len(timeline_events)}")
                except Exception:
                    pass
                # Emit an updated render with precise timeline aligned to voice
                try:
                    print("[TeacherAgent] emit render (updated timeline)")
                except Exception:
                    pass
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
            except Exception as e:
                print(f"[TeacherAgent] TTS failed: {e}")

        try:
            print("[TeacherAgent] emit speak + final")
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
        """Extract TSX/JSX code from a variety of fencing styles.

        Handles:
          - ```tsx ... ``` (with optional trailing language metadata)
          - ```jsx ... ```
          - ``` ... ``` (no language)
          - ~~~tsx ... ~~~ (rare)
          - Unfenced responses that start with function/component definitions
        """
        import re

        cleaned = text.strip()

        # 1) Triple backticks with optional language and metadata
        m = re.search(r"```\s*(?:tsx|jsx)?[^\n]*\r?\n([\s\S]*?)\r?\n```", cleaned, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()

        # 2) Any fenced code block without language
        m2 = re.search(r"```\s*\r?\n([\s\S]*?)\r?\n```", cleaned, flags=re.IGNORECASE)
        if m2:
            return m2.group(1).strip()

        # 3) Tilde fences
        m3 = re.search(r"~~~\s*(?:tsx|jsx)?[^\n]*\r?\n([\s\S]*?)\r?\n~~~", cleaned, flags=re.IGNORECASE)
        if m3:
            return m3.group(1).strip()

        # 4) Heuristic: grab from first function/const component declaration
        heuristic = re.search(
            r"(function\s+[A-Za-z_][A-Za-z0-9_]*\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*;?\s*(?:module\.exports\s*=|export\s+default|$))",
            cleaned,
            flags=re.IGNORECASE,
        )
        if heuristic:
            return heuristic.group(1).strip()

        return None

    @staticmethod
    def _normalize_tsx(raw_code: str) -> str:
        """Normalize model TSX into a bundler-free CommonJS snippet.

        - Strips import/export lines
        - Converts `export default function Name` → `function Name` + `module.exports = Name;`
        - Ensures `module.exports` points to a plausible component (Lesson/App/Component)
        """
        import re

        code = raw_code.strip()

        # Remove BOM or stray backticks
        code = code.replace("\ufeff", "").strip('`')

        # Strip import lines (single line imports only)
        code = re.sub(r"^\s*import\s+[^\n]*\n", "", code, flags=re.MULTILINE)

        # Replace `export default function Name` with `function Name`
        code = re.sub(r"^\s*export\s+default\s+function\s+", "function ", code, flags=re.IGNORECASE | re.MULTILINE)

        # Replace bare `export default <Identifier>` with just `<Identifier>` on its own line
        code = re.sub(r"^\s*export\s+default\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$", r"\1", code, flags=re.IGNORECASE | re.MULTILINE)

        # Replace `export default (` anonymous component with a named const
        if re.search(r"^\s*export\s+default\s*\(", code, flags=re.IGNORECASE | re.MULTILINE):
            code = re.sub(r"^\s*export\s+default\s*\(", "const Lesson = (", code, flags=re.IGNORECASE | re.MULTILINE)

        # Remove any remaining `export` keywords that might appear on consts
        code = re.sub(r"^\s*export\s+", "", code, flags=re.IGNORECASE | re.MULTILINE)

        # Ensure we have a component name to export
        component_name = None
        for pattern in [
            r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
            r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(",
            r"let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(",
        ]:
            m = re.search(pattern, code)
            if m:
                component_name = m.group(1)
                break

        if not component_name:
            # Fallback to a conventional name and wrap if necessary
            component_name = "Lesson"
            if "return (" not in code:
                # Build a minimal safe component without f-strings to avoid brace interpolation issues
                prefix = (
                    "function " + component_name + "(\n" +
                    "  { slide, showCaptions, isPlaying, timeSeconds, timeline }\n" +
                    ") {\n" +
                    "  return (<div>Rendering error: invalid component</div>);\n" +
                    "}\n"
                )
                code = prefix + code

        # Append module.exports assignment if missing
        if not re.search(r"module\.exports\s*=", code):
            code = code.rstrip() + f"\n\nmodule.exports = {component_name};\n"

        return code


