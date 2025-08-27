"""TTS client utilities for OpenAI Voices and Cartesia SSE.

Generates speech audio for given text and saves the result into the project's
storage directory so it can be served to the frontend. For Cartesia, this
client also returns per-word timestamps when requested.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Literal, Optional, List, Dict, Any

import httpx
import json


def _get_project_root() -> Path:
    # <repo>/python_services/shared/voice_client.py → climb 3 levels to repo root
    return Path(__file__).resolve().parents[2]


def _ensure_audio_dir() -> Path:
    root = _get_project_root()
    audio_dir = root / "storage" / "generated_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    return audio_dir


class OpenAIVoiceClient:
    """Minimal async client for OpenAI TTS (Voices)."""

    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://api.openai.com") -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        self.base_url = base_url.rstrip("/")

    async def synthesize(
        self,
        text: str,
        *,
        voice: str = "alloy",
        model: str = "gpt-4o-mini-tts",
        format: Literal["mp3", "wav", "flac", "ogg"] = "mp3",
        filename_prefix: str = "slide_voice",
    ) -> dict:
        """Synthesize speech and save to storage/generated_audio.

        Returns a dict with keys: {"file_path", "public_url", "duration_seconds" (best-effort 0), "model", "voice"}
        """
        audio_dir = _ensure_audio_dir()
        ts = int(time.time() * 1000)
        filename = f"{filename_prefix}_{ts}.{format}"
        file_path = audio_dir / filename

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            # Hint the server to return MPEG when possible
            "Accept": "audio/mpeg" if format == "mp3" else "*/*",
        }
        # OpenAI TTS REST endpoint returns binary audio
        url = f"{self.base_url}/v1/audio/speech"
        payload = {
            "model": model,
            "voice": voice,
            "input": text,
            # Informative; some deployments honor this as response_format
            "format": format,
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            resp = await client.post(url, headers=headers, json=payload)
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                # Surface server error text for easier debugging
                detail = None
                try:
                    detail = resp.text
                except Exception:
                    pass
                raise RuntimeError(f"TTS request failed ({resp.status_code}): {detail or str(e)}") from e
            with open(file_path, "wb") as f:
                f.write(resp.content)

        # Construct public URL as served by api_server via StaticFiles
        public_url = f"/storage/generated_audio/{filename}"
        return {
            "file_path": str(file_path),
            "public_url": public_url,
            "duration_seconds": 0,  # Duration not available without probing; leave 0
            "model": model,
            "voice": voice,
        }


async def synthesize_openai_tts(
    text: str,
    *,
    voice: str = "alloy",
    model: str = "gpt-4o-mini-tts",
    format: Literal["mp3", "wav", "flac", "ogg"] = "mp3",
    filename_prefix: str = "slide_voice",
) -> dict:
    """Convenience function to synthesize speech using OpenAI Voices."""
    client = OpenAIVoiceClient()
    return await client.synthesize(text, voice=voice, model=model, format=format, filename_prefix=filename_prefix)


class CartesiaTTSClient:
    """Minimal client for Cartesia TTS SSE endpoint.

    Docs: https://docs.cartesia.ai/api-reference/tts/sse
    We call the HTTP POST endpoint (non-streaming) for simplicity and request
    raw PCM that we convert to WAV on disk, or directly request mp3/ogg if supported.
    We also request timestamps when add_timestamps=True and return them.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://api.cartesia.ai") -> None:
        self.api_key = api_key or os.environ.get("CARTESIA_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("CARTESIA_API_KEY is not set")
        self.base_url = base_url.rstrip("/")
        self.api_version = os.environ.get("CARTESIA_API_VERSION", "2025-04-16")

    async def synthesize(
        self,
        text: str,
        *,
        voice_id: Optional[str] = None,
        model_id: str = "sonic-2",
        language: Optional[str] = "en",
        format: Literal["mp3", "wav", "ogg"] = "wav",
        filename_prefix: str = "slide_voice",
        add_timestamps: bool = True,
        speed: Literal["slow", "normal", "fast"] = "normal",
    ) -> dict:
        """Synthesize speech via Cartesia and save to storage/generated_audio.

        Returns a dict with keys: {
          "file_path", "public_url", "duration_seconds" (0 if unknown),
          "model", "voice", "provider": "cartesia",
          "word_timestamps": [{"word": str, "start": float, "end": float}] (if available)
        }
        """
        audio_dir = _ensure_audio_dir()
        ts = int(time.time() * 1000)
        # We'll write a WAV file locally after converting raw PCM
        filename = f"{filename_prefix}_{ts}.wav"
        file_path = audio_dir / filename

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Cartesia-Version": self.api_version,
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        voice_obj: Dict[str, Any] = {"mode": "id"}
        if voice_id:
            voice_obj["id"] = voice_id
        else:
            # Allow environment default
            default_voice = os.environ.get("CARTESIA_VOICE_ID")
            if default_voice:
                voice_obj["id"] = default_voice
        if "id" not in voice_obj:
            raise RuntimeError("Cartesia voice_id is required; set CARTESIA_VOICE_ID or pass voice_id")
        # SSE prefers raw PCM; request float32 PCM, 44.1kHz, then convert to WAV locally
        output_format = {"container": "raw", "encoding": "pcm_f32le", "sample_rate": 44100}

        payload = {
            "model_id": model_id,
            "transcript": text,
            "voice": voice_obj,
            "output_format": output_format,
            "language": language,
            "add_timestamps": bool(add_timestamps),
            "speed": speed,
        }

        url = f"{self.base_url}/tts/sse"
        word_timestamps: List[Dict[str, Any]] = []
        # Accumulate raw float32 PCM bytes
        raw_pcm_bytes = bytearray()

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                try:
                    resp.raise_for_status()
                except httpx.HTTPStatusError as e:
                    detail = None
                    try:
                        detail = await resp.aread()
                        if detail:
                            detail = detail.decode(errors="ignore")
                    except Exception:
                        pass
                    raise RuntimeError(f"Cartesia TTS request failed ({resp.status_code}): {detail or str(e)}") from e

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    # Handle Server-Sent Events format (data: <json>)
                    if line.startswith("data:"):
                        line = line[len("data:"):].strip()
                    try:
                        ev = json.loads(line)
                    except Exception:
                        # Some servers send keepalives/comments starting with ':'
                        continue

                    # Collect word timestamps
                    if isinstance(ev, dict):
                        if "timestamps" in ev and isinstance(ev["timestamps"], list):
                            for t in ev["timestamps"]:
                                w = t.get("word") or t.get("text")
                                start = float(t.get("start", 0.0))
                                end = float(t.get("end", max(0.0, start)))
                                if w:
                                    word_timestamps.append({"word": w, "start": start, "end": end})

                        # Collect audio chunks: look for common shapes
                        # 1) { "chunk": { "data": "<base64>" } }
                        # 2) { "type": "chunk", "data": "<base64>" }
                        # 3) { "audio": "<base64>" }
                        b64_data = None
                        chunk_obj = ev.get("chunk") if isinstance(ev.get("chunk"), dict) else None
                        if chunk_obj and isinstance(chunk_obj.get("data"), str):
                            b64_data = chunk_obj.get("data")
                        elif ev.get("type") == "chunk" and isinstance(ev.get("data"), str):
                            b64_data = ev.get("data")
                        elif isinstance(ev.get("audio"), str):
                            b64_data = ev.get("audio")
                        if b64_data:
                            import base64
                            try:
                                raw_pcm_bytes.extend(base64.b64decode(b64_data))
                            except Exception:
                                pass

        # Convert raw float32 PCM to WAV (16-bit PCM) and write to disk
        try:
            from array import array
            import struct
            if raw_pcm_bytes:
                # Interpret bytes as little-endian float32 values
                float_count = len(raw_pcm_bytes) // 4
                floats = array('f')
                floats.frombytes(raw_pcm_bytes[:float_count * 4])
                # Convert to int16 with clipping
                ints = array('h')
                for v in floats:
                    # clamp to [-1, 1]
                    if v < -1.0:
                        v = -1.0
                    elif v > 1.0:
                        v = 1.0
                    ints.append(int(max(-32768, min(32767, int(v * 32767.0)))))
                # Write WAV header + data
                import wave
                with wave.open(str(file_path), 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)  # 16-bit
                    wf.setframerate(44100)
                    wf.writeframes(ints.tobytes())
        except Exception:
            # If conversion failed but we have some bytes, dump as-is (raw)
            if raw_pcm_bytes and not file_path.exists():
                with open(file_path, "wb") as f:
                    f.write(raw_pcm_bytes)

        public_url = f"/storage/generated_audio/{filename}"
        return {
            "file_path": str(file_path),
            "public_url": public_url,
            "duration_seconds": 0,
            "model": model_id,
            "voice": voice_obj.get("id"),
            "provider": "cartesia",
            "word_timestamps": word_timestamps,
        }


async def synthesize_cartesia_tts(
    text: str,
    *,
    voice_id: Optional[str] = None,
    model_id: str = "sonic-2",
    language: Optional[str] = "en",
    format: Literal["mp3", "wav", "ogg"] = "mp3",
    filename_prefix: str = "slide_voice",
    add_timestamps: bool = True,
    speed: Literal["slow", "normal", "fast"] = "normal",
) -> dict:
    """Convenience wrapper for Cartesia TTS with word timestamps."""
    client = CartesiaTTSClient()
    return await client.synthesize(
        text,
        voice_id=voice_id,
        model_id=model_id,
        language=language,
        format=format,
        filename_prefix=filename_prefix,
        add_timestamps=add_timestamps,
        speed=speed,
    )


