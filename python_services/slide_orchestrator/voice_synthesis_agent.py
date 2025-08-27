"""
🎙️ Voice Synthesis Agent for Slide Orchestrator
Generates AI voice narration for teaching slides using OpenAI Voices (default)
and remains compatible with a local VOICE_SYNTHESIS_SERVICE_URL fallback.
"""

import asyncio
import logging
import uuid
from typing import Dict, Any, Optional
import aiohttp
import os
from datetime import datetime

from .agent_base import AgentBase
from .shared_memory import memory_table
from shared.voice_client import synthesize_openai_tts

logger = logging.getLogger(__name__)

class VoiceSynthesisAgent(AgentBase):
    """Agent responsible for generating voice narration for slides."""
    
    def __init__(self, agent_id: str = "main") -> None:
        super().__init__(agent_id)
        self.voice_service_url = os.getenv("VOICE_SYNTHESIS_SERVICE_URL")
        self.session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Initializes and returns the aiohttp session, creating it if it doesn't exist."""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session

    @AgentBase.retryable  # type: ignore[misc]
    async def _perform_voice_synthesis(self, task_id: str, task: Dict[str, Any]) -> None:
        """Generate voice narration for a slide."""
        try:
            logger.info(f"🎙️ Starting voice synthesis for task {task_id}")
            
            # Extract task data
            speaker_notes = task.get("speaker_notes", "")
            slide_number = task.get("slide_number", 0)
            learning_goal = task.get("learning_goal", "")
            
            if not speaker_notes or not speaker_notes.strip():
                logger.warning(f"⚠️ No speaker notes for slide {slide_number}, skipping voice synthesis")
                # Mark as done even if no content
                with memory_table("voice_tasks") as db:
                    if task_id in db:
                        db[task_id].update({
                            "status": "done",
                            "audio_id": None,
                            "audio_url": None,
                            "duration_seconds": 0,
                            "provider_used": "none",
                            "error": "No speaker notes available"
                        })
                        db.sync()
                return
            
            # Transform notes to sound like a teacher speaking to students, not meta-instructions
            # Simple heuristic: strip imperative meta like "Explain"/"Introduce" at the start
            cleaned_notes = speaker_notes.strip()
            lowered = cleaned_notes.lower()
            for prefix in ("explain ", "introduce ", "describe ", "teach ", "say ", "talk about "):
                if lowered.startswith(prefix):
                    cleaned_notes = cleaned_notes[len(prefix):].lstrip()
                    break
            # If the notes look generic, replace with a friendlier opener using slide title
            if len(cleaned_notes.split()) <= 8 or cleaned_notes.endswith(":") or cleaned_notes.strip().lower().startswith("let's walk through"):
                slide_title = task.get("title") or f"slide {slide_number}"
                cleaned_notes = f"Alright, let's talk about {slide_title}. {cleaned_notes}".strip()

            logger.info(f"🎵 Synthesizing voice for slide {slide_number}: '{cleaned_notes[:50]}...'")

            if self.voice_service_url:
                # Backward-compat: use existing local voice service if explicitly configured
                session = await self._get_session()
                async with session.post(
                    f"{self.voice_service_url}/synthesize",
                    json={
                        "text": speaker_notes,
                        "voice": "elevenlabs_neural",
                        "speed": 1.0,
                        "pitch": "medium",
                        "emotion": "friendly",
                        "language": "en-US",
                        "provider": "elevenlabs",
                        "model": "eleven_multilingual_v2",
                        "quality": "balanced"
                    },
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        audio_id = result.get("audio_id")
                        audio_url = result.get("audio_url") or (f"{self.voice_service_url}/audio/{audio_id}" if audio_id else None)
                        duration_seconds = result.get("duration_seconds", 0)
                        provider_used = result.get("provider_used", "local_voice_service")
                        model_used = result.get("model_used", "eleven_multilingual_v2")
                    else:
                        error_text = await response.text()
                        raise Exception(f"Voice synthesis service error ({response.status}): {error_text}")
            else:
                # Default: OpenAI Voices
                tts = await synthesize_openai_tts(
                    cleaned_notes,
                    voice=os.getenv("OPENAI_VOICE", "alloy"),
                    model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
                    format="mp3",
                    filename_prefix=f"slide_{slide_number}"
                )
                audio_id = None
                audio_url = tts.get("public_url")
                duration_seconds = tts.get("duration_seconds", 0)
                provider_used = "openai"
                model_used = tts.get("model", "gpt-4o-mini-tts")

            if audio_url:
                with memory_table("voice_tasks") as db:
                    if task_id in db:
                        db[task_id] = {
                            **db[task_id],
                            "status": "done",
                            "audio_id": audio_id,
                            "audio_url": audio_url,
                            "duration_seconds": duration_seconds,
                            "provider_used": provider_used,
                            "model_used": model_used,
                            "completed_at": datetime.utcnow().isoformat()
                        }
                        db.sync()
                logger.info(f"✅ Voice synthesis completed for slide {slide_number} via {provider_used}")
            else:
                raise Exception("Voice synthesis returned no audio URL")
                    
        except Exception as e:
            logger.error(f"❌ Voice synthesis failed for task {task_id}: {e}")
            
            # Update task with error
            with memory_table("voice_tasks") as db:
                if task_id in db:
                    db[task_id].update({
                        "status": "failed",  # Changed from 'error' to 'failed'
                        "error": str(e),
                        "completed_at": datetime.utcnow().isoformat()
                    })
                    db.sync()
            
            raise

    async def run(self) -> None:
        """Processes all currently pending voice synthesis tasks and then stops."""
        logger.info(f"🎙️ VoiceSynthesisAgent {self.agent_id} starting a batch run...")
        try:
            with memory_table("voice_tasks") as db:
                pending_tasks = {
                    task_id: task for task_id, task in db.items() 
                    if task.get("status") == "pending"
                }

            if not pending_tasks:
                logger.info("No pending voice tasks found.")
                return

            with memory_table("voice_tasks") as db:
                for task_id in pending_tasks:
                    db[task_id] = {**db[task_id], "status": "in_progress"}

            semaphore = asyncio.Semaphore(5)
            
            async def process_task_wrapper(task_id: str, task: Dict[str, Any]):
                async with semaphore:
                    try:
                        await self._perform_voice_synthesis(task_id, task)
                    except Exception as e:
                        logger.error(f"Voice task {task_id} failed permanently after retries: {e}")

            # Create and await all tasks
            tasks_to_run = [
                process_task_wrapper(task_id, task) 
                for task_id, task in pending_tasks.items()
            ]
            logger.info(f"🎙️ Processing {len(tasks_to_run)} voice synthesis tasks...")
            await asyncio.gather(*tasks_to_run)

        except Exception as e:
            logger.error(f"❌ VoiceSynthesisAgent {self.agent_id} batch run error: {e}")
        finally:
            # Gracefully close the session after the run is fully complete
            if self.session and not self.session.closed:
                await self.session.close()
            logger.info(f"🎙️ VoiceSynthesisAgent {self.agent_id} batch run finished.")

# Test function
async def test_voice_synthesis_agent():
    """Test the voice synthesis agent with a sample task."""
    import json
    
    # Create a test task
    test_task_id = str(uuid.uuid4())
    test_task = {
        "status": "pending",
        "objective": "Generate voice narration for slide",
        "learning_goal": "Test learning goal",
        "slide_id": "test_slide_1",
        "slide_number": 1,
        "speaker_notes": "Welcome to this lesson about artificial intelligence. Today we'll explore the fascinating world of machine learning and neural networks.",
        "content_task_id": "test_content_1"
    }
    
    # Add to memory
    with memory_table("voice_tasks") as db:
        db[test_task_id] = test_task
    
    logger.info("🧪 Testing VoiceSynthesisAgent...")
    
    # Run agent for a limited time
    agent = VoiceSynthesisAgent("test-worker")
    try:
        # Run for 30 seconds
        await asyncio.wait_for(agent.run(), timeout=30)
    except asyncio.TimeoutError:
        logger.info("⏰ Test timeout reached")
    finally:
        # Check results
        with memory_table("voice_tasks") as db:
            if test_task_id in db:
                result = db[test_task_id]
                logger.info(f"📊 Test result: {json.dumps(result, indent=2)}")
            else:
                logger.warning("⚠️ Test task not found in results")

if __name__ == "__main__":
    # Run test
    asyncio.run(test_voice_synthesis_agent()) 