#!/usr/bin/env python3
"""
Startup script for the Math Teaching Service
Specialized mathematics education with AI-powered step-by-step instruction
"""

import subprocess
import sys
import time
import requests
from pathlib import Path

def check_service_health(port=8004, max_retries=30):
    """Check if the math teaching service is healthy"""
    for i in range(max_retries):
        try:
            response = requests.get(f"http://localhost:{port}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Math Teaching Service is healthy: {data.get('status', 'unknown')}")
                print(f"   - Available LLM providers: {data.get('llm_providers', [])}")
                print(f"   - Math topics available: {data.get('math_topics', 0)}")
                return True
        except requests.exceptions.RequestException:
            pass
        
        print(f"⏳ Waiting for Math Teaching Service to start... ({i+1}/{max_retries})")
        time.sleep(2)
    
    return False

def start_service():
    """Start the Math Teaching Service"""
    print("🎓 Starting Math Teaching Service...")
    print("   Specialized AI mathematics tutor with step-by-step visual instruction")
    
    # Get the service directory
    service_dir = Path(__file__).parent / "math_teaching_service"
    
    try:
        # Start the service
        process = subprocess.Popen([
            sys.executable, "-m", "uvicorn", "main:app",
            "--host", "0.0.0.0",
            "--port", "8004",
            "--reload"
        ], cwd=service_dir)
        
        print(f"🚀 Math Teaching Service started with PID: {process.pid}")
        print("   URL: http://localhost:8004")
        print("   API Docs: http://localhost:8004/docs")
        
        # Wait a moment for the service to start
        time.sleep(3)
        
        # Check health
        if check_service_health():
            print("🎯 Math Teaching Service is ready for mathematics education!")
            return process
        else:
            print("❌ Math Teaching Service failed to start properly")
            process.terminate()
            return None
            
    except Exception as e:
        print(f"❌ Failed to start Math Teaching Service: {str(e)}")
        return None

if __name__ == "__main__":
    process = start_service()
    if process:
        try:
            print("\n📚 Math Teaching Service is running!")
            print("   Features:")
            print("   - Fundamentals-first approach")
            print("   - Step-by-step visual instruction")
            print("   - Voice-enabled explanations")
            print("   - Adaptive difficulty levels")
            print("   - Multiple math topics (arithmetic, algebra, geometry, trigonometry, calculus)")
            print("\n   Press Ctrl+C to stop the service...")
            process.wait()
        except KeyboardInterrupt:
            print("\n🛑 Stopping Math Teaching Service...")
            process.terminate()
            process.wait()
            print("✅ Math Teaching Service stopped.")
    else:
        sys.exit(1) 