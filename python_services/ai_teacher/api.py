from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .models import StartSessionRequest, StreamLessonRequest, TeacherEvent
from .fixer import attempt_fix, attempt_llm_fix
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
                async for ev in agent.stream_lesson(req):
                    yield ev.model_dump_json() + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:  # noqa: BLE001
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            finally:
                # occasional heartbeat while client processes
                await asyncio.sleep(0)

        return StreamingResponse(gen(), media_type="text/plain")

    @router.post("/render-error")
    async def render_error(payload: dict):
        code = payload.get("code")
        error = payload.get("error")
        if not code or not error:
            raise HTTPException(status_code=400, detail="code and error are required")

        try:
            # Track repair history per session for conversational continuity
            session_id = payload.get("sessionId") or payload.get("session_id")
            repair_history = []
            if session_id:
                st = session_state.ensure(session_id)
                if "repair_history" not in st:
                    st["repair_history"] = []
                # append current error context
                st["repair_history"].append({
                    "error": str(error),
                    "platform": payload.get("platform"),
                })
                # Keep only recent N
                st["repair_history"] = st["repair_history"][-10:]
                repair_history = st["repair_history"]

            # 1) Quick, deterministic fixes
            fixed = await attempt_fix(
                code=code,
                error_message=str(error),
                topic=payload.get("topic"),
                platform=payload.get("platform"),
            )
            # If quick fix produced no change, escalate to LLM with session context
            if fixed.strip() == code.strip():
                ctx = None
                if session_id:
                    try:
                        ctx = session_state.get(session_id).get("last_generation")
                    except Exception:
                        ctx = None
                fixed_llm = await attempt_llm_fix(
                    code=code,
                    error_message=str(error),
                    session_context=ctx,
                    repair_history=repair_history,
                )
                # Persist last_generation.code with the fixed result for future attempts
                if session_id and fixed_llm:
                    try:
                        st = session_state.ensure(session_id)
                        if "last_generation" not in st:
                            st["last_generation"] = {}
                        st["last_generation"]["code"] = fixed_llm
                    except Exception:
                        pass
                return {"fixed_code": fixed_llm}
            else:
                # Persist last_generation.code with deterministic fix too
                if session_id and fixed:
                    try:
                        st = session_state.ensure(session_id)
                        if "last_generation" not in st:
                            st["last_generation"] = {}
                        st["last_generation"]["code"] = fixed
                    except Exception:
                        pass
                return {"fixed_code": fixed}
        except Exception as e:  # noqa: BLE001
            # Best-effort; return a message, no raise
            return {"message": f"fix_failed: {e}"}

    return router



