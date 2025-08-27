#!/usr/bin/env python3
"""
Start Teaching Content Service - Smart Curriculum Generation and Whiteboard Content
Standalone script to run the Teaching Content Service independently
"""

import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add current directory to Python path
sys.path.append(str(Path(__file__).parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """Start the Teaching Content Service"""
    
    # Set environment variables if not already set
    os.environ.setdefault('TEACHING_CONTENT_PORT', '8004')
    os.environ.setdefault('TEACHING_CONTENT_HOST', '0.0.0.0')
    os.environ.setdefault('FILE_STORAGE_PATH', './storage/documents')
    os.environ.setdefault('VECTOR_DB_TYPE', 'chromadb')
    
    # Check for API keys
    api_keys = {
        'OPENAI_API_KEY': os.getenv('OPENAI_API_KEY'),
        'ANTHROPIC_API_KEY': os.getenv('ANTHROPIC_API_KEY'),
        'GOOGLE_AI_KEY': os.getenv('GOOGLE_AI_KEY')
    }
    
    available_providers = sum(1 for key in api_keys.values() if key)
    
    if available_providers == 0:
        logger.error("❌ No AI provider API keys found!")
        logger.error("Please set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_KEY")
        logger.error("Run 'python setup_env.py' for setup assistance")
        sys.exit(1)
    else:
        logger.info(f"✅ Found {available_providers} AI provider(s) configured")
    
    # Create storage directories if they don't exist
    storage_path = Path('./storage')
    (storage_path / 'documents' / 'user_uploads').mkdir(parents=True, exist_ok=True)
    (storage_path / 'documents' / 'processed').mkdir(parents=True, exist_ok=True)
    (storage_path / 'vector_db').mkdir(parents=True, exist_ok=True)
    
    logger.info("Starting Teaching Content Service...")
    logger.info(f"Port: {os.getenv('TEACHING_CONTENT_PORT', '8004')}")
    logger.info(f"Host: {os.getenv('TEACHING_CONTENT_HOST', '0.0.0.0')}")
    
    try:
        # Import and run the service
        from teaching_content_service.main import app
        import uvicorn
        
        uvicorn.run(
            app,
            host=os.getenv('TEACHING_CONTENT_HOST', '0.0.0.0'),
            port=int(os.getenv('TEACHING_CONTENT_PORT', '8004')),
            reload=True,
            log_level="info"
        )
        
    except ImportError as e:
        logger.error(f"Failed to import Teaching Content Service: {e}")
        logger.error("Make sure all dependencies are installed: pip install -r requirements.txt")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Failed to start Teaching Content Service: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 