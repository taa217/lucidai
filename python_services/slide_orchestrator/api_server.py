from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os
from pydantic import BaseModel
import asyncio
from .graph import run_demo
from .simple_flow import generate_and_store_plan, generate_two_slides_via_llm
from .shared_memory import memory_table
from typing import Dict, Any, Optional
import json
import time
from datetime import datetime
from pathlib import Path
from shared.voice_client import synthesize_openai_tts

app = FastAPI()

# CORS (dev): allow app to call endpoints directly and for preflight to succeed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount AI Teacher router (sibling package import)
try:
    from ai_teacher import get_router as get_teacher_router  # type: ignore
    app.include_router(get_teacher_router())
except Exception as _e:
    # Leave other endpoints functional even if teacher router fails to import
    print(f"[api_server] AI Teacher router not mounted: {_e}")
# Basic health endpoint so upstream services can check availability
@app.get("/health")
async def health():
    return {"service": "slide_orchestrator", "status": "healthy", "timestamp": datetime.utcnow().isoformat(), "version": "0.1.0"}


# Minimal compatibility endpoints for legacy voice service checks
@app.get("/providers/status")
async def providers_status():
    openai_ok = bool(os.environ.get("OPENAI_API_KEY"))
    return {
        "service": "slide_orchestrator",
        "providers": [
            {"name": "openai", "status": "available" if openai_ok else "unavailable"}
        ],
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/voices")
async def list_voices():
    # Static list for UI; actual synthesis uses env OPENAI_VOICE
    voices = [
        {"id": "alloy", "name": "Alloy", "provider": "openai"},
        {"id": "verse", "name": "Verse", "provider": "openai"},
        {"id": "aria", "name": "Aria", "provider": "openai"},
    ]
    return {"provider": "openai", "voices": voices, "timestamp": datetime.utcnow().isoformat()}

# Use absolute path for generated images directory

# Point to the project root's storage/generated_images
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
images_dir = os.path.join(PROJECT_ROOT, "storage", "generated_images")
audio_dir = os.path.join(PROJECT_ROOT, "storage", "generated_audio")

# Ensure the directory exists
os.makedirs(images_dir, exist_ok=True)
os.makedirs(audio_dir, exist_ok=True)

# Serve generated images as static files
app.mount(
    "/storage/generated_images",
    StaticFiles(directory=images_dir),
    name="generated_images"
)

# Serve generated audio as static files
app.mount(
    "/storage/generated_audio",
    StaticFiles(directory=audio_dir),
    name="generated_audio"
)

class SlideRequest(BaseModel):
    user_query: str
    learning_goal: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None

class VoiceRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = 1.0
    pitch: Optional[str] = None
    emotion: Optional[str] = None
    language: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None

@app.post("/synthesize")
async def synthesize_voice(req: VoiceRequest):
    """Compatibility endpoint expected by the Nest server.

    Generates TTS via OpenAI Voices and returns metadata similar to the legacy service.
    """
    try:
        if not req.text or not req.text.strip():
            raise HTTPException(status_code=400, detail="text is required")
        # Normalize incoming provider/voice from legacy callers
        allowed_voices = {"alloy", "verse", "aria"}
        requested_voice = (req.voice or os.environ.get("OPENAI_VOICE", "alloy")).lower()
        selected_voice = requested_voice if requested_voice in allowed_voices else os.environ.get("OPENAI_VOICE", "alloy")

        # Only allow known OpenAI TTS models; ignore legacy provider models like eleven_multilingual_v2
        allowed_models = {
            "gpt-4o-mini-tts",
            "gpt-4o-audio-preview",
            "gpt-4o-realtime-preview",  # some accounts
        }
        requested_model = (req.model or os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"))
        selected_model = requested_model if requested_model in allowed_models else os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
        # If caller explicitly indicates a non-OpenAI provider, force default OpenAI model
        if req.provider and str(req.provider).lower() != "openai":
            selected_model = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")

        result = await synthesize_openai_tts(
            req.text,
            voice=selected_voice,
            model=selected_model,
            format="mp3",
            filename_prefix="server_api"
        )
        file_path = Path(result["file_path"])  # e.g., storage/generated_audio/xxx.mp3
        audio_id = file_path.name  # Use filename as ID for GET /audio/{audio_id}
        return {
            "audio_id": audio_id,
            "audio_url": result["public_url"],
            "duration_seconds": result.get("duration_seconds", 0),
            "voice_used": selected_voice,
            "provider_used": "openai",
            "model_used": result.get("model", selected_model),
            "cache_hit": False,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/audio/{audio_id}")
async def get_audio(audio_id: str):
    """Serve audio by ID for compatibility with the Nest proxy."""
    file_path = Path(audio_dir) / audio_id
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(file_path), media_type="audio/mpeg")

class SlideRequest(BaseModel):
    user_query: str
    learning_goal: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None

class VoiceRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = 1.0
    pitch: Optional[str] = None
    emotion: Optional[str] = None
    language: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None

@app.post("/generate_slides")
async def generate_slides(req: SlideRequest):
    # Clear old tasks/checkpoints to ensure dynamic lessons per request
    for table in ["research_tasks", "content_tasks", "visual_tasks", "voice_tasks"]:
        with memory_table(table) as db:
            db.clear()
    final_state = await run_demo(req.user_query, req.learning_goal)

    # Prefer fully assembled deck; fallback to content slides
    deck = final_state.get("final_deck")
    if not deck:
        content_outputs = final_state.get("content_outputs") or []
        if content_outputs and content_outputs[0].get("slides"):
            deck = content_outputs[0]["slides"]
        else:
            deck = []
    return {"slides": deck}


@app.post("/slides/stream-simple")
async def stream_slides_simple(req: SlideRequest):
    """Simplified streaming: plan → two slides → voice per slide.

    Emits NDJSON lines with events:
      {"type":"plan", "plan": {...}}
      {"type":"slide", "slide": {...}}
      {"type":"slide_update", "slide_number": N, "slide": {...}}
      {"type":"final", "slides": [...]}
      {"type":"error", "message": str}
    """

    # Reset only the minimal tables we rely on
    for table in ["plans", "content_tasks", "voice_tasks", "events"]:
        with memory_table(table) as db:
            db.clear()

    async def event_generator():
        yield json.dumps({"type": "start", "message": "simple stream opened"}) + "\n"

        # 1) Plan and persist
        plan = await generate_and_store_plan(session_id=req.session_id, learning_goal=req.learning_goal)
        yield json.dumps({"type": "plan", "plan": plan}) + "\n"

        # 2) Create two slides (LLM or deterministic fallback)
        slides = await generate_two_slides_via_llm(req.learning_goal)
        # Store slides in content_tasks for incremental updates and voice integration
        content_task_id = "simple-content"
        with memory_table("content_tasks") as db:
            db[content_task_id] = {"id": content_task_id, "status": "in_progress", "slides": slides}

        # Emit each slide to the client
        for s in slides:
            yield json.dumps({"type": "slide", "slide": s}) + "\n"

        # 3) Generate voice for each slide, updating content_tasks as URLs become available
        try:
            from .voice_synthesis_agent import VoiceSynthesisAgent
        except Exception as e:
            yield json.dumps({"type": "error", "message": f"Voice agent import failed: {e}"}) + "\n"
            yield json.dumps({"type": "final", "slides": slides}) + "\n"
            return

        # Enqueue simple per-slide voice tasks
        created = 0
        with memory_table("voice_tasks") as vdb:
            for s in slides:
                sn = s.get("slide_number")
                notes = s.get("speaker_notes")
                if not notes:
                    continue
                tid = f"voice-{sn}"
                vdb[tid] = {
                    "id": tid,
                    "status": "pending",
                    "objective": f"Generate voice for slide {sn}",
                    "slide_number": sn,
                    "speaker_notes": notes,
                }
                created += 1

        if created:
            agent = VoiceSynthesisAgent("simple-voice")
            await agent.run()

        # Integrate voice results back into slides and emit updates
        with memory_table("voice_tasks") as vdb:
            results = [t for t in vdb.values() if t.get("status") == "done" and t.get("audio_url")]

        if results:
            with memory_table("content_tasks") as db:
                task = db.get(content_task_id, {"slides": slides})
                for r in results:
                    for s in task["slides"]:
                        if s.get("slide_number") == r.get("slide_number"):
                            s["audio_url"] = r.get("audio_url")
                            s["audio_duration"] = r.get("duration_seconds")
                            try:
                                s["version"] = int(s.get("version", 0)) + 1
                            except Exception:
                                s["version"] = 1
                            yield json.dumps({"type": "slide_update", "slide_number": s["slide_number"], "slide": s}) + "\n"
                task["status"] = "done"
                db[content_task_id] = task
                slides = task["slides"]

        # 4) Final deck (two slides)
        yield json.dumps({"type": "final", "slides": slides}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/plain")

@app.post("/slides/stream")
async def stream_slides(req: SlideRequest):
    """
    Stream slides one-by-one as they are generated by the content agent.
    Emits NDJSON lines with event objects:
      {"type":"slide","slide":{...}}
      {"type":"slide_update","slide_number":N,"slide":{...}}
      {"type":"final","slides":[...]}
      {"type":"error","message":str}
    """

    # Clear old tasks/checkpoints to ensure dynamic lessons per request
    for table in ["research_tasks", "content_tasks", "visual_tasks", "voice_tasks"]:
        with memory_table(table) as db:
            db.clear()

    async def event_generator():
        # Immediately open the stream so upstream proxies/clients don't time out
        yield json.dumps({"type": "start", "message": "slides stream opened"}) + "\n"

        # Start the graph in the background
        graph_task = asyncio.create_task(run_demo(req.user_query, req.learning_goal))

        # Track seen slides and last known states for updates
        seen: Dict[int, Dict[str, Any]] = {}
        last_heartbeat = time.time()

        try:
            last_seq = 0
            while True:
                emitted = False

                # Emit new slides from content memory
                with memory_table("content_tasks") as db:
                    for _, task in db.items():
                        slides = task.get("slides", []) or []
                        for slide in slides:
                            sn = slide.get("slide_number")
                            if not isinstance(sn, int):
                                continue
                            # First time seeing this slide
                            prev = seen.get(sn)
                            if prev is None:
                                seen[sn] = json.loads(json.dumps(slide))  # deep copy snapshot
                                yield json.dumps({"type": "slide", "slide": slide}) + "\n"
                                emitted = True
                            else:
                                # Detect updates (e.g., visuals appended)
                                # Prefer explicit version bump when available; fallback to structural diffs
                                prev_contents = (prev.get("contents") or [])
                                curr_contents = (slide.get("contents") or [])
                                prev_audio = (prev.get("audio_url"), prev.get("audio_duration"))
                                curr_audio = (slide.get("audio_url"), slide.get("audio_duration"))
                                prev_version = prev.get("version", 0)
                                curr_version = slide.get("version", 0)
                                has_version_change = curr_version != prev_version
                                has_structural_change = (len(curr_contents) != len(prev_contents)) or (curr_audio != prev_audio)
                                if has_version_change or has_structural_change:
                                    seen[sn] = json.loads(json.dumps(slide))
                                    yield json.dumps({
                                        "type": "slide_update",
                                        "slide_number": sn,
                                        "slide": slide,
                                    }) + "\n"
                                    emitted = True

                # Emit newly appended granular events (planner_phase, slide_created, visual_added, voice_ready)
                try:
                    with memory_table("events") as evdb:
                        # events are keyed by seq as string; stream in order
                        keys = []
                        for key in evdb.keys():
                            try:
                                keys.append(int(key))
                            except Exception:
                                # Some rows may not be numeric keys; skip
                                ev = evdb.get(key)
                                if isinstance(ev, dict) and "seq" in ev:
                                    try:
                                        keys.append(int(ev["seq"]))
                                    except Exception:
                                        continue
                                continue
                        keys.sort()
                        for seq in keys:
                            if seq > last_seq:
                                ev = evdb.get(str(seq)) or {}
                                if ev:
                                    yield json.dumps(ev) + "\n"
                                    emitted = True
                                    last_seq = seq
                except Exception:
                    pass

                # Heartbeat to keep upstream connections alive if nothing emitted recently
                now = time.time()
                if not emitted and (now - last_heartbeat) >= 5.0:
                    yield json.dumps({"type": "heartbeat", "ts": now}) + "\n"
                    last_heartbeat = now

                # Break if graph finished
                if graph_task.done():
                    try:
                        final_state = graph_task.result()
                    except Exception as e:  # noqa: BLE001
                        yield json.dumps({"type": "error", "message": str(e)}) + "\n"
                        break

                    # Prefer fully assembled deck; fallback to content slides
                    deck = final_state.get("final_deck")
                    if not deck:
                        content_outputs = final_state.get("content_outputs") or []
                        if content_outputs and content_outputs[0].get("slides"):
                            deck = content_outputs[0]["slides"]
                        else:
                            deck = []
                    yield json.dumps({"type": "final", "slides": deck}) + "\n"
                    break

                # Small delay between polls
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:  # noqa: PERF203
            # Client disconnected or server shutdown
            pass
        except Exception as e:  # noqa: BLE001
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/plain")