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
        # Simplified: stop auto-fixing. Instruct client to show retry UI.
        # Validate minimal fields but do not attempt repair.
        code = payload.get("code")
        error = payload.get("error")
        if not code or not error:
            raise HTTPException(status_code=400, detail="code and error are required")
        # Optionally record error context for telemetry
        try:
            session_id = payload.get("sessionId") or payload.get("session_id")
            if session_id:
                st = session_state.ensure(session_id)
                if "repair_history" not in st:
                    st["repair_history"] = []
                st["repair_history"].append({"error": str(error), "platform": payload.get("platform")})
                st["repair_history"] = st["repair_history"][-10:]
        except Exception:
            pass
        return {"message": "check internet connection"}

    return router



