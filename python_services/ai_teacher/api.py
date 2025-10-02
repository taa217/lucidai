from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .models import StartSessionRequest, StreamLessonRequest, TeacherEvent
from .state import session_state
from .agent import TeacherAgent


def get_router() -> APIRouter:
    router = APIRouter(prefix="/teacher", tags=["ai_teacher"])

    @router.post("/start")
    async def start_session(req: StartSessionRequest):
        session_id = req.session_id or f"teacher_{req.user_id or 'anon'}"
        st = session_state.ensure(session_id)
        st["topic"] = req.topic
        st["user_id"] = req.user_id
        return {"sessionId": session_id}

    @router.post("/stream")
    async def stream(req: StreamLessonRequest):
        agent = TeacherAgent()

        async def gen() -> AsyncGenerator[str, None]:
            # Immediate open
            yield json.dumps({"type": "start"}) + "\n"
            try:
                print(f"[TeacherAPI] /teacher/stream opened for topic='{req.topic}' user='{req.user_id}'")
            except Exception:
                pass
            try:
                async for ev in agent.stream_lesson(req):
                    try:
                        print(f"[TeacherAPI] emit event type={ev.type} seq={getattr(ev, 'seq', None)}")
                    except Exception:
                        pass
                    yield ev.model_dump_json() + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:  # noqa: BLE001
                try:
                    print(f"[TeacherAPI] stream error: {e}")
                except Exception:
                    pass
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            finally:
                # occasional heartbeat while client processes
                await asyncio.sleep(0)

        return StreamingResponse(gen(), media_type="text/plain")

    @router.post("/render-error")
    async def render_error(payload: dict):
        # Validate required fields
        code = payload.get("code")
        error = payload.get("error")
        if not code or not error:
            raise HTTPException(status_code=400, detail="code and error are required")

        # Gather optional context
        session_id = payload.get("sessionId") or payload.get("session_id")
        topic = payload.get("topic")
        platform = payload.get("platform")

        # Record error in session repair history (best-effort)
        st = None
        try:
            if session_id:
                st = session_state.ensure(session_id)
                history = st.get("repair_history") or []
                history.append({"error": str(error), "platform": platform})
                st["repair_history"] = history[-10:]
        except Exception:
            st = None

        # Log payload summary
        try:
            print("[TeacherAPI] /teacher/render-error", {
                "codeLen": len(code or ''),
                "error": str(error)[:200],
                "sessionId": session_id,
                "topic": topic,
                "platform": platform,
            })
        except Exception:
            pass

        # Try deterministic quick fixes first
        fixed_code = None
        try:
            from .fixer import attempt_fix, attempt_llm_fix  # local imports to avoid startup overhead
            quick = await attempt_fix(code, str(error), topic=topic, platform=platform)
            if quick and quick != code:
                fixed_code = quick
            else:
                # If we have session context (last_generation), attempt an LLM repair
                session_context = None
                repair_history = None
                try:
                    if st and isinstance(st, dict):
                        session_context = st.get("last_generation")
                        repair_history = st.get("repair_history") or []
                except Exception:
                    pass
                llm_fixed = await attempt_llm_fix(
                    code=code,
                    error_message=str(error),
                    session_context=session_context,
                    repair_history=repair_history,
                )
                if llm_fixed and llm_fixed.strip():
                    fixed_code = llm_fixed.strip()
        except Exception as _e:
            fixed_code = None

        try:
            print("[TeacherAPI] /teacher/render-error result", {
                "fixed": bool(fixed_code),
                "fixedLen": len(fixed_code or '') if fixed_code else 0
            })
        except Exception:
            pass
        resp = {"success": True, "message": "received", "fixedCode": fixed_code}
        return resp

    return router



