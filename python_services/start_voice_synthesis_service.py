#!/usr/bin/env python3
"""
🎙️ Enhanced Voice Synthesis Service Launcher
Starts the multi-provider AI teaching voice synthesis service with ElevenLabs support
"""

import os
import sys
import asyncio
import logging
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.append(str(project_root))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def setup_environment():
    """🔧 Set up environment variables for enhanced voice synthesis service"""
    
    # Service configuration
    os.environ.setdefault("VOICE_SYNTHESIS_PORT", "8005")
    os.environ.setdefault("VOICE_SYNTHESIS_HOST", "0.0.0.0")
    
    # ElevenLabs Configuration (Primary Provider)
    if not os.getenv("ELEVENLABS_API_KEY"):
        logger.warning("⚠️ ELEVENLABS_API_KEY not set - ElevenLabs will be unavailable")
        logger.info("💡 Get your ElevenLabs API key from: https://elevenlabs.io/")
    else:
        logger.info("✅ ElevenLabs API key configured")
    
    # Azure Speech Service (Secondary Provider)
    if not os.getenv("AZURE_SPEECH_KEY"):
        logger.warning("⚠️ AZURE_SPEECH_KEY not set - Azure Speech will be unavailable")
    else:
        logger.info("✅ Azure Speech API key configured")
    
    if not os.getenv("AZURE_SPEECH_REGION"):
        os.environ.setdefault("AZURE_SPEECH_REGION", "eastus")
    
    # Voice synthesis configuration
    os.environ.setdefault("VOICE_CACHE_SIZE", "100")
    os.environ.setdefault("VOICE_CACHE_TTL", "3600")  # 1 hour
    os.environ.setdefault("DEFAULT_VOICE_PROVIDER", "elevenlabs")
    os.environ.setdefault("FALLBACK_ENABLED", "true")
    
    logger.info("🔧 Environment configured for Enhanced Voice Synthesis Service")

def check_dependencies():
    """🔍 Check if required and optional dependencies are available"""
    required_available = True
    
    # Core dependencies
    try:
        import fastapi
        import uvicorn
        logger.info("✅ Core dependencies (FastAPI, Uvicorn) available")
    except ImportError as e:
        logger.error(f"❌ Missing core dependency: {e}")
        required_available = False
    
    # Voice providers
    providers_count = 0
    
    # ElevenLabs (Primary Provider)
    try:
        from elevenlabs.client import ElevenLabs
        logger.info("✅ ElevenLabs SDK available")
        providers_count += 1
    except ImportError:
        logger.warning("⚠️ ElevenLabs SDK not available - install with: pip install elevenlabs")
    
    # Azure Speech SDK (Secondary Provider)
    try:
        import azure.cognitiveservices.speech
        logger.info("✅ Azure Speech SDK available")
        providers_count += 1
    except ImportError:
        logger.warning("⚠️ Azure Speech SDK not available - install with: pip install azure-cognitiveservices-speech")
    
    # Google TTS (Fallback Provider)
    try:
        from gtts import gTTS
        logger.info("✅ gTTS available")
        providers_count += 1
    except ImportError:
        logger.warning("⚠️ gTTS not available - install with: pip install gTTS")
    
    if providers_count == 0:
        logger.error("❌ No voice synthesis providers available!")
        logger.error("📋 Install at least one provider:")
        logger.error("   • ElevenLabs: pip install elevenlabs")
        logger.error("   • Azure: pip install azure-cognitiveservices-speech")
        logger.error("   • gTTS: pip install gTTS")
        return False
    elif providers_count == 1:
        logger.warning(f"⚠️ Only 1 voice provider available - consider installing more for better reliability")
    else:
        logger.info(f"✅ {providers_count} voice providers available - excellent redundancy!")
    
    return required_available

def start_service():
    """🚀 Start the enhanced voice synthesis service"""
    try:
        logger.info("🎙️ Starting Enhanced Voice Synthesis Service...")
        
        # Setup environment
        setup_environment()
        
        # Check dependencies
        if not check_dependencies():
            logger.error("❌ Missing required dependencies")
            return False
        
        # Get service configuration
        port = os.getenv("VOICE_SYNTHESIS_PORT", "8005")
        host = os.getenv("VOICE_SYNTHESIS_HOST", "0.0.0.0")
        
        logger.info(f"🎙️ Enhanced Voice Synthesis Service starting on {host}:{port}")
        logger.info("🎯 Provider Priority: ElevenLabs → Azure → gTTS")
        
        # Import and run the service
        import uvicorn
        
        uvicorn.run(
            "voice_synthesis_service.main:app",
            host=host,
            port=int(port),
            log_level="info",
            reload=True
        )
        
    except KeyboardInterrupt:
        logger.info("🛑 Enhanced Voice Synthesis Service stopped by user")
    except Exception as e:
        logger.error(f"❌ Enhanced Voice Synthesis Service failed to start: {str(e)}")
        logger.exception("Full error details:")
        return False
    
    return True

if __name__ == "__main__":
    logger.info("🎙️ Enhanced Voice Synthesis Service Launcher")
    logger.info("🌟 Multi-Provider Support: ElevenLabs, Azure Speech, gTTS")
    
    success = start_service()
    
    if not success:
        logger.error("❌ Service failed to start")
        sys.exit(1)
    
    logger.info("✅ Service completed") 