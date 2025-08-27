#!/usr/bin/env python3
"""
Startup script for Q&A Agent Service.
Handles environment setup and service initialization.
"""

import os
import sys
import subprocess
from pathlib import Path

def check_environment():
    """Check if the environment is properly set up."""
    print("🔍 Checking environment...")
    
    # Check if we're in a virtual environment
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("⚠️  Warning: Not running in a virtual environment")
        print("   Consider running: python_services/venv/Scripts/activate")
    
    # Check if .env file exists
    env_file = Path(".env")
    if not env_file.exists():
        print("⚠️  No .env file found. Copying from env.example...")
        example_file = Path("env.example")
        if example_file.exists():
            env_file.write_text(example_file.read_text())
            print("✅ .env file created. Please edit it with your API keys.")
        else:
            print("❌ env.example not found!")
            return False
    
    return True

def check_dependencies():
    """Check if required dependencies are installed."""
    print("📦 Checking dependencies...")
    
    try:
        import fastapi
        import uvicorn
        import openai
        import anthropic
        print("✅ All dependencies are installed")
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: pip install -r requirements.txt")
        return False

def start_service():
    """Start the Q&A service."""
    print("🚀 Starting Q&A Agent Service...")
    
    # Change to the service directory
    service_dir = Path("qna_agent_service")
    if not service_dir.exists():
        print("❌ qna_agent_service directory not found!")
        return False
    
    os.chdir(service_dir)
    
    try:
        # Import settings to check configuration
        sys.path.append(str(Path("..").resolve()))
        from shared.config import get_settings, debug_settings
        
        settings = get_settings()
        
        print(f"📍 Service: {settings.service_name}")
        print(f"🌐 Port: {settings.service_port}")
        print(f"🐛 Debug: {settings.debug}")
        
        # Show detailed configuration
        debug_settings()
        
        # Check if any LLM providers are configured
        providers = []
        if settings.openai_api_key:
            providers.append("OpenAI")
        if settings.anthropic_api_key:
            providers.append("Anthropic")
        
        if not providers:
            print("⚠️  No LLM providers configured! Add API keys to .env file")
            print("   The service will start but won't be able to process questions")
        else:
            print(f"🤖 LLM Providers: {', '.join(providers)}")
        
        print("\n" + "="*50)
        print("🎯 Service starting at:")
        print(f"   http://localhost:{settings.service_port}")
        print(f"   Health check: http://localhost:{settings.service_port}/health")
        print(f"   API docs: http://localhost:{settings.service_port}/docs")
        print("="*50 + "\n")
        
        # Start the service
        if settings.debug:
            # Development mode with auto-reload
            subprocess.run([
                sys.executable, "main.py"
            ])
        else:
            # Production mode
            subprocess.run([
                "uvicorn", "main:app",
                "--host", "0.0.0.0",
                "--port", str(settings.service_port)
            ])
            
    except Exception as e:
        print(f"❌ Failed to start service: {e}")
        return False
    
    return True

def main():
    """Main startup function."""
    print("🌟 Lucid Learn AI - Q&A Agent Service Startup")
    print("=" * 50)
    
    # Check environment
    if not check_environment():
        print("❌ Environment check failed!")
        return
    
    # Check dependencies
    if not check_dependencies():
        print("❌ Dependency check failed!")
        return
    
    # Start service
    start_service()

if __name__ == "__main__":
    main() 