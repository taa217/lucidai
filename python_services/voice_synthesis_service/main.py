"""
🎙️ Enhanced Voice Synthesis Service - AI Teaching Platform
Multi-Provider Voice Synthesis with ElevenLabs, Azure, and gTTS
Converts teaching text to natural speech for immersive learning
"""

import os
import io
import logging
import tempfile
import hashlib
import asyncio
from typing import Optional, Dict, Any, Tuple, List
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
from datetime import datetime
from contextlib import asynccontextmanager
from enum import Enum

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    logging.info("✅ Environment variables loaded from .env file")
except ImportError:
    logging.warning("⚠️ python-dotenv not available - using system environment variables only")
except Exception as e:
    logging.warning(f"⚠️ Could not load .env file: {e}")

# Voice synthesis providers
try:
    from elevenlabs.client import ElevenLabs
    from elevenlabs import play, VoiceSettings
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False
    logging.warning("ElevenLabs SDK not available")

try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_AVAILABLE = True
except ImportError:
    AZURE_AVAILABLE = False
    logging.warning("Azure Speech SDK not available")

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    logging.warning("gTTS not available")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Voice Provider Enum
class VoiceProvider(str, Enum):
    ELEVENLABS = "elevenlabs"
    AZURE = "azure"
    GTTS = "gtts"

# ElevenLabs Voice Models
class ElevenLabsModel(str, Enum):
    ELEVEN_V3 = "eleven_v3"
    MULTILINGUAL_V2 = "eleven_multilingual_v2"
    FLASH_V2_5 = "eleven_flash_v2_5"
    TURBO_V2_5 = "eleven_turbo_v2_5"

# Global providers
elevenlabs_client = None
azure_synthesizer = None
voice_cache = {}
provider_priority = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    """🚀 Enhanced application lifespan with multi-provider initialization"""
    global elevenlabs_client, azure_synthesizer, provider_priority
    
    try:
        logger.info("🎙️ Initializing Enhanced Voice Synthesis Service...")
        
        # Initialize ElevenLabs (Primary Provider)
        if ELEVENLABS_AVAILABLE:
            elevenlabs_api_key = os.getenv('ELEVENLABS_API_KEY')
            if elevenlabs_api_key:
                try:
                    # DEBUG: Log API key info (masked)
                    masked_key = elevenlabs_api_key[:10] + "..." + elevenlabs_api_key[-4:] if len(elevenlabs_api_key) > 14 else "***"
                    logger.info(f"🔑 ElevenLabs API key found: {masked_key}")
                    
                    elevenlabs_client = ElevenLabs(api_key=elevenlabs_api_key)
                    
                    # Test ElevenLabs connection
                    voices = elevenlabs_client.voices.get_all()
                    logger.info(f"✅ ElevenLabs initialized with {len(voices.voices)} voices available")
                    provider_priority.append(VoiceProvider.ELEVENLABS)
                except Exception as e:
                    logger.error(f"❌ ElevenLabs initialization failed: {e}")
                    # DEBUG: Log the full exception
                    logger.exception("Full ElevenLabs initialization error:")
                    elevenlabs_client = None
            else:
                logger.warning("⚠️ ELEVENLABS_API_KEY not provided")
        
        # Initialize Azure Speech Service (Secondary Provider)
        if AZURE_AVAILABLE:
            subscription_key = os.getenv('AZURE_SPEECH_KEY')
            region = os.getenv('AZURE_SPEECH_REGION', 'eastus')
            
            if subscription_key:
                try:
                    speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
                    speech_config.speech_synthesis_voice_name = "en-US-AriaNeural"
                    azure_synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)
                    logger.info("✅ Azure Speech Synthesizer initialized")
                    provider_priority.append(VoiceProvider.AZURE)
                except Exception as e:
                    logger.error(f"❌ Azure Speech initialization failed: {e}")
                    azure_synthesizer = None
            else:
                logger.warning("⚠️ AZURE_SPEECH_KEY not provided")
        
        # gTTS (Fallback Provider)
        if GTTS_AVAILABLE:
            logger.info("✅ gTTS available as fallback provider")
            provider_priority.append(VoiceProvider.GTTS)
        
        # Create cache directory
        cache_dir = Path("voice_cache")
        cache_dir.mkdir(exist_ok=True)
        
        logger.info(f"🎯 Provider Priority: {' → '.join(provider_priority)}")
        
        if not provider_priority:
            logger.error("❌ No voice synthesis providers available!")
            raise Exception("No voice synthesis providers available")
        
        logger.info("✅ Enhanced Voice Synthesis Service started successfully")
        
    except Exception as e:
        logger.error(f"❌ Startup error: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down Enhanced Voice Synthesis Service")

# Enhanced Pydantic models
class VoiceSynthesisRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    voice: str = Field(default="elevenlabs_neural", description="Voice type")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed")
    pitch: str = Field(default="medium", description="Voice pitch")
    emotion: str = Field(default="friendly", description="Voice emotion")
    language: str = Field(default="en-US", description="Language code")
    provider: Optional[VoiceProvider] = Field(default=None, description="Preferred voice provider")
    model: Optional[str] = Field(default=None, description="Voice model (for ElevenLabs)")
    voice_id: Optional[str] = Field(default=None, description="Specific voice ID (for ElevenLabs)")
    quality: str = Field(default="balanced", description="Quality preference: fast, balanced, high")

class VoiceSynthesisResponse(BaseModel):
    audio_id: str
    duration_seconds: float
    voice_used: str
    provider_used: str
    model_used: Optional[str] = None
    cache_hit: bool
    timestamp: str

class VoiceProviderStatus(BaseModel):
    provider: VoiceProvider
    available: bool
    configured: bool
    priority: int
    last_error: Optional[str] = None

# Initialize FastAPI app
app = FastAPI(
    title="🎙️ Enhanced Voice Synthesis Service",
    description="Multi-Provider AI Teaching Voice Synthesis - ElevenLabs, Azure, gTTS",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """🏠 Root endpoint with service overview"""
    return {
        "service": "Enhanced Voice Synthesis Service",
        "status": "healthy",
        "version": "2.0.0",
        "providers": {
            "elevenlabs": {
                "available": ELEVENLABS_AVAILABLE,
                "configured": bool(elevenlabs_client),
                "priority": 1 if VoiceProvider.ELEVENLABS in provider_priority else None
            },
            "azure": {
                "available": AZURE_AVAILABLE,
                "configured": bool(azure_synthesizer),
                "priority": provider_priority.index(VoiceProvider.AZURE) + 1 if VoiceProvider.AZURE in provider_priority else None
            },
            "gtts": {
                "available": GTTS_AVAILABLE,
                "configured": GTTS_AVAILABLE,
                "priority": provider_priority.index(VoiceProvider.GTTS) + 1 if VoiceProvider.GTTS in provider_priority else None
            }
        },
        "cache_size": len(voice_cache),
        "default_provider": provider_priority[0] if provider_priority else None,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """🏥 Comprehensive health check"""
    try:
        providers_status = []
        for i, provider in enumerate(provider_priority):
            if provider == VoiceProvider.ELEVENLABS:
                providers_status.append(VoiceProviderStatus(
                    provider=provider,
                    available=ELEVENLABS_AVAILABLE,
                    configured=bool(elevenlabs_client),
                    priority=i + 1
                ))
            elif provider == VoiceProvider.AZURE:
                providers_status.append(VoiceProviderStatus(
                    provider=provider,
                    available=AZURE_AVAILABLE,
                    configured=bool(azure_synthesizer),
                    priority=i + 1
                ))
            elif provider == VoiceProvider.GTTS:
                providers_status.append(VoiceProviderStatus(
                    provider=provider,
                    available=GTTS_AVAILABLE,
                    configured=GTTS_AVAILABLE,
                    priority=i + 1
                ))
        
        return {
            "service": "voice_synthesis_service",
            "status": "healthy" if provider_priority else "degraded",
            "providers": [status.dict() for status in providers_status],
            "stats": {
                "cached_voices": len(voice_cache),
                "available_providers": len(provider_priority),
                "default_provider": provider_priority[0] if provider_priority else None
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"service": "voice_synthesis_service", "status": "unhealthy", "error": str(e)}

@app.post("/synthesize", response_model=VoiceSynthesisResponse)
async def synthesize_speech(request: VoiceSynthesisRequest):
    """🎵 Enhanced speech synthesis with multi-provider support"""
    try:
        # Create comprehensive cache key
        cache_key = hashlib.md5(
            f"{request.text}_{request.voice}_{request.speed}_{request.pitch}_{request.emotion}_{request.language}_{request.provider}_{request.model}_{request.voice_id}".encode()
        ).hexdigest()
        
        # Check cache first
        if cache_key in voice_cache:
            logger.info(f"🎯 Cache hit for audio: {cache_key}")
            cached_entry = voice_cache[cache_key]
            return VoiceSynthesisResponse(
                audio_id=cache_key,
                duration_seconds=cached_entry['duration'],
                voice_used=request.voice,
                provider_used=cached_entry.get('provider_used', 'unknown'),
                model_used=cached_entry.get('model_used'),
                cache_hit=True,
                timestamp=datetime.utcnow().isoformat()
            )
        
        # Generate speech with provider selection
        audio_data, duration, audio_format, provider_used, model_used = await generate_speech_with_fallback(request)
        
        # Cache the result
        voice_cache[cache_key] = {
            'audio_data': audio_data,
            'duration': duration,
            'format': audio_format,
            'provider_used': provider_used,
            'model_used': model_used,
            'created_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"✅ Speech synthesized: {cache_key}, provider: {provider_used}, duration: {duration}s")
        
        return VoiceSynthesisResponse(
            audio_id=cache_key,
            duration_seconds=duration,
            voice_used=request.voice,
            provider_used=provider_used,
            model_used=model_used,
            cache_hit=False,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"❌ Speech synthesis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")

@app.get("/audio/{audio_id}")
async def get_audio(audio_id: str):
    """🎵 Retrieve synthesized audio by ID"""
    try:
        if audio_id not in voice_cache:
            raise HTTPException(status_code=404, detail="Audio not found")
        
        cache_entry = voice_cache[audio_id]
        audio_data = cache_entry['audio_data']
        audio_format = cache_entry.get('format', 'mp3')
        
        # Determine media type
        media_type = f"audio/{audio_format}"
        
        logger.info(f"🎵 Serving audio {audio_id}: {len(audio_data)} bytes, format: {audio_format}, provider: {cache_entry.get('provider_used', 'unknown')}")
        
        def generate():
            yield audio_data
        
        return StreamingResponse(
            generate(),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename=speech_{audio_id}.{audio_format}",
                "Content-Length": str(len(audio_data)),
                "Cache-Control": "max-age=3600",
                "Accept-Ranges": "bytes"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Audio retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio retrieval failed: {str(e)}")

@app.post("/teaching/voice-segments")
async def generate_teaching_voice(segments: List[dict]):
    """🎓 Generate voice for multiple teaching segments with enhanced processing"""
    try:
        logger.info(f"🎓 Processing {len(segments)} teaching segments...")
        voice_segments = []
        
        for i, segment in enumerate(segments):
            voice_text = segment.get('voice_text', '') or segment.get('voiceText', '')
            
            if not voice_text or voice_text.strip() == '':
                logger.warning(f"⚠️ Segment {i} has no voice_text, skipping")
                continue
            
            logger.info(f"🎵 Processing segment {i}: {voice_text[:50]}...")
            
            # Enhanced voice request with ElevenLabs optimizations
            request = VoiceSynthesisRequest(
                text=voice_text,
                voice="elevenlabs_neural",
                speed=1.0,
                emotion="friendly",
                quality="balanced",
                provider=VoiceProvider.ELEVENLABS  # Prefer ElevenLabs for teaching
            )
            
            voice_result = await synthesize_speech(request)
            
            voice_segments.append({
                "segment_id": segment.get('id', segment.get('segmentId', f'segment_{i}')),
                "audio_id": voice_result.audio_id,
                "duration": voice_result.duration_seconds,
                "voice_text": voice_text,
                "visual_content": segment.get('visual_content', '') or segment.get('visualContent', ''),
                "coordinates": segment.get('coordinates', {}),
                "visual_action": segment.get('visual_action', segment.get('visualAction', 'write')),
                "provider_used": voice_result.provider_used,
                "model_used": voice_result.model_used
            })
        
        if not voice_segments:
            raise HTTPException(status_code=400, detail="No valid segments with voice text found")
        
        return {
            "session_id": f"voice_session_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            "voice_segments": voice_segments,
            "total_duration": sum(seg['duration'] for seg in voice_segments),
            "providers_used": list(set(seg['provider_used'] for seg in voice_segments)),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Teaching voice generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Teaching voice generation failed: {str(e)}")

# 🎯 Enhanced speech generation with intelligent fallback
async def generate_speech_with_fallback(request: VoiceSynthesisRequest) -> Tuple[bytes, float, str, str, Optional[str]]:
    """Generate speech with intelligent provider selection and fallback"""
    
    # Determine provider order
    providers_to_try = []
    
    if request.provider:
        # User specified a provider - try it first
        providers_to_try.append(request.provider)
        # Add other providers as fallback
        for provider in provider_priority:
            if provider != request.provider:
                providers_to_try.append(provider)
    else:
        # Use default priority order
        providers_to_try = provider_priority.copy()
    
    last_error = None
    
    for provider in providers_to_try:
        try:
            logger.info(f"🎵 Attempting synthesis with {provider}")
            
            if provider == VoiceProvider.ELEVENLABS and elevenlabs_client:
                return await generate_elevenlabs_speech(request)
            elif provider == VoiceProvider.AZURE and azure_synthesizer:
                return await generate_azure_speech(request)
            elif provider == VoiceProvider.GTTS and GTTS_AVAILABLE:
                return await generate_gtts_speech(request)
            else:
                logger.warning(f"⚠️ Provider {provider} not available or not configured")
                continue
                
        except Exception as e:
            last_error = str(e)
            logger.warning(f"⚠️ Provider {provider} failed: {e}")
            continue
    
    raise Exception(f"All voice synthesis providers failed. Last error: {last_error}")

# 🎙️ ElevenLabs Implementation
async def generate_elevenlabs_speech(request: VoiceSynthesisRequest) -> Tuple[bytes, float, str, str, str]:
    """Generate speech using ElevenLabs (Primary Provider)"""
    try:
        logger.info(f"🎙️ Synthesizing with ElevenLabs: {request.text[:50]}...")
        
        # Determine model
        model = request.model or ElevenLabsModel.MULTILINGUAL_V2
        
        # DEBUG: Log the actual model value being used
        logger.info(f"🔍 ElevenLabs model requested: {request.model}, using: {model}")
        
        # Ensure model is a string value, not enum
        if hasattr(model, 'value'):
            model = model.value
        
        # Determine voice ID
        voice_id = request.voice_id or "JBFqnCBsd6RMkjVDRZzb"  # Default voice
        
        # DEBUG: Log the voice ID being used
        logger.info(f"🔍 ElevenLabs voice_id: {voice_id}")
        
        # Convert speed and emotion to ElevenLabs voice settings
        voice_settings = VoiceSettings(
            stability=0.7,
            similarity_boost=0.8,
            style=0.5 if request.emotion == "friendly" else 0.3,
            use_speaker_boost=True
        )
        
        # Generate speech
        audio_generator = elevenlabs_client.text_to_speech.convert(
            text=request.text,
            voice_id=voice_id,
            model_id=model,
            voice_settings=voice_settings,
            output_format="mp3_44100_128"
        )
        
        # Collect audio data
        audio_data = b""
        for chunk in audio_generator:
            audio_data += chunk
        
        # Estimate duration
        duration = len(request.text.split()) * 0.5  # ElevenLabs is typically faster/more efficient
        
        logger.info(f"✅ ElevenLabs synthesis complete: {len(audio_data)} bytes")
        
        return audio_data, duration, "mp3", VoiceProvider.ELEVENLABS, model
            
    except Exception as e:
        logger.error(f"❌ ElevenLabs synthesis failed: {str(e)}")
        # DEBUG: Log the full exception details
        logger.exception("Full ElevenLabs error:")
        raise

# 🔊 Azure Implementation
async def generate_azure_speech(request: VoiceSynthesisRequest) -> Tuple[bytes, float, str, str, str]:
    """Generate speech using Azure Cognitive Services"""
    try:
        logger.info(f"🔊 Synthesizing with Azure: {request.text[:50]}...")
        
        # Create SSML with voice characteristics
        ssml = f"""
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{request.language}">
            <voice name="en-US-AriaNeural">
                <prosody rate="{request.speed}" pitch="{request.pitch}">
                    <mstts:express-as style="{request.emotion}">
                        {request.text}
                    </mstts:express-as>
                </prosody>
            </voice>
        </speak>
        """
        
        # Execute synthesis in thread pool to avoid blocking
        result = await asyncio.get_event_loop().run_in_executor(
            None, azure_synthesizer.speak_ssml, ssml
        )
        
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            audio_data = result.audio_data
            duration = len(request.text.split()) * 0.6
            logger.info(f"✅ Azure synthesis complete: {len(audio_data)} bytes")
            return audio_data, duration, "wav", VoiceProvider.AZURE, "AriaNeural"
        else:
            raise Exception(f"Azure synthesis failed: {result.reason}")
            
    except Exception as e:
        logger.error(f"❌ Azure synthesis failed: {str(e)}")
        raise

# 🌐 Google TTS Implementation
async def generate_gtts_speech(request: VoiceSynthesisRequest) -> Tuple[bytes, float, str, str, str]:
    """Generate speech using Google Text-to-Speech (Fallback)"""
    try:
        logger.info(f"🌐 Synthesizing with gTTS: {request.text[:50]}...")
        
        # Execute gTTS in thread pool to avoid blocking
        def _generate_gtts():
            tts = gTTS(
                text=request.text,
                lang=request.language[:2],
                slow=request.speed < 0.8
            )
            
            audio_buffer = io.BytesIO()
            tts.write_to_fp(audio_buffer)
            return audio_buffer.getvalue()
        
        audio_data = await asyncio.get_event_loop().run_in_executor(None, _generate_gtts)
        duration = len(request.text.split()) * 0.6
        
        logger.info(f"✅ gTTS synthesis complete: {len(audio_data)} bytes")
        return audio_data, duration, "mp3", VoiceProvider.GTTS, "standard"
        
    except Exception as e:
        logger.error(f"❌ gTTS synthesis failed: {str(e)}")
        raise

@app.get("/voices")
async def list_available_voices():
    """📋 List available voices and providers"""
    voices = {}
    
    # ElevenLabs voices
    if elevenlabs_client:
        try:
            elevenlabs_voices = elevenlabs_client.voices.get_all()
            voices["elevenlabs"] = {
                "provider": "ElevenLabs",
                "description": "Premium AI voices with natural expression",
                "available": True,
                "voices": [
                    {
                        "id": voice.voice_id,
                        "name": voice.name,
                        "category": voice.category,
                        "description": voice.description
                    }
                    for voice in elevenlabs_voices.voices[:10]  # Limit to first 10
                ],
                "models": [model.value for model in ElevenLabsModel]
            }
        except Exception as e:
            logger.error(f"Failed to fetch ElevenLabs voices: {e}")
            voices["elevenlabs"] = {"available": False, "error": str(e)}
    
    # Azure voices
    if azure_synthesizer:
        voices["azure"] = {
            "provider": "Azure Cognitive Services",
            "description": "Microsoft Neural Voices",
            "available": True,
            "voices": [
                {"id": "en-US-AriaNeural", "name": "Aria", "description": "Friendly female voice"},
                {"id": "en-US-DavisNeural", "name": "Davis", "description": "Professional male voice"},
                {"id": "en-US-JennyNeural", "name": "Jenny", "description": "Conversational female voice"}
            ]
        }
    
    # gTTS voices
    if GTTS_AVAILABLE:
        voices["gtts"] = {
            "provider": "Google Text-to-Speech",
            "description": "Basic text-to-speech (fallback)",
            "available": True,
            "voices": [
                {"id": "standard", "name": "Standard", "description": "Basic voice synthesis"}
            ]
        }
    
    return {
        "providers": voices,
        "provider_priority": provider_priority,
        "default_provider": provider_priority[0] if provider_priority else None
    }

@app.get("/providers/status")
async def get_provider_status():
    """📊 Detailed provider status"""
    return {
        "elevenlabs": {
            "enabled": ELEVENLABS_AVAILABLE,
            "configured": bool(elevenlabs_client),
            "priority": provider_priority.index(VoiceProvider.ELEVENLABS) + 1 if VoiceProvider.ELEVENLABS in provider_priority else None
        },
        "azure": {
            "enabled": AZURE_AVAILABLE,
            "configured": bool(azure_synthesizer),
            "priority": provider_priority.index(VoiceProvider.AZURE) + 1 if VoiceProvider.AZURE in provider_priority else None
        },
        "gtts": {
            "enabled": GTTS_AVAILABLE,
            "configured": GTTS_AVAILABLE,
            "priority": provider_priority.index(VoiceProvider.GTTS) + 1 if VoiceProvider.GTTS in provider_priority else None
        },
        "provider_priority": provider_priority,
        "total_cached": len(voice_cache)
    }

if __name__ == "__main__":
    # Load environment variables
    port = int(os.getenv("VOICE_SYNTHESIS_PORT", "8003"))
    host = os.getenv("VOICE_SYNTHESIS_HOST", "0.0.0.0")
    
    logger.info(f"🚀 Starting Enhanced Voice Synthesis Service on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    ) 