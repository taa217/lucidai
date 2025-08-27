"""
Debug Service Manager - Enhanced logging to troubleshoot QnA service startup
"""

import os
import sys
import time
import subprocess
import logging
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Enhanced logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def debug_qna_service():
    """Debug QnA service startup with detailed logging"""
    print("🔍 Debug QnA Service Startup")
    print("="*50)
    
    # Check environment variables
    print("\n📋 Environment Variables:")
    env_vars = ['QNA_SERVICE_PORT', 'PYTHONPATH', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_AI_KEY']
    for var in env_vars:
        value = os.getenv(var)
        if var.endswith('_KEY'):
            display_value = f"{'*' * 10}...{value[-4:]}" if value else "Not set"
        else:
            display_value = value if value else "Not set"
        print(f"  {var}: {display_value}")
    
    # Prepare environment like the service manager does
    env = os.environ.copy()
    env.update({
        'PYTHONPATH': str(Path(__file__).parent),
        'QNA_SERVICE_PORT': '8001',
        'FILE_STORAGE_PATH': './storage/documents',
        'VECTOR_DB_TYPE': 'chromadb'
    })
    
    print(f"\n🚀 Starting QnA service with command: ['{sys.executable}', '-m', 'qna_agent_service.main']")
    print(f"📁 Working directory: {Path(__file__).parent}")
    
    # Start the service
    try:
        process = subprocess.Popen(
            [sys.executable, '-m', 'qna_agent_service.main'],
            cwd=Path(__file__).parent,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        print(f"✅ Process started with PID: {process.pid}")
        
        # Monitor the process for 30 seconds with detailed health checks
        start_time = time.time()
        health_attempts = 0
        
        while time.time() - start_time < 30:
            # Check if process is still running
            if process.poll() is not None:
                stdout, stderr = process.communicate()
                print(f"\n❌ Process terminated unexpectedly!")
                print(f"Exit code: {process.returncode}")
                if stdout:
                    print(f"STDOUT:\n{stdout}")
                if stderr:
                    print(f"STDERR:\n{stderr}")
                return False
            
            # Try health check
            health_attempts += 1
            elapsed = int(time.time() - start_time)
            
            try:
                print(f"\n🔍 Health check attempt #{health_attempts} (after {elapsed}s)")
                
                response = requests.get(
                    "http://localhost:8001/health",
                    timeout=5
                )
                
                print(f"✅ Health check successful!")
                print(f"   Status Code: {response.status_code}")
                print(f"   Response: {response.text}")
                
                # Service is healthy, stop it
                process.terminate()
                process.wait(timeout=5)
                return True
                
            except requests.exceptions.ConnectionError:
                print(f"   ⏳ Connection refused (service may still be starting)")
            except requests.exceptions.Timeout:
                print(f"   ⏳ Request timeout")
            except Exception as e:
                print(f"   ❌ Unexpected error: {str(e)}")
            
            time.sleep(2)
        
        # Timeout reached
        print(f"\n⏰ Timeout reached after 30 seconds")
        
        # Get any output from the process
        try:
            stdout, stderr = process.communicate(timeout=5)
            if stdout:
                print(f"STDOUT:\n{stdout}")
            if stderr:
                print(f"STDERR:\n{stderr}")
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            print("Process was killed due to timeout")
        
        return False
        
    except Exception as e:
        print(f"❌ Error starting process: {str(e)}")
        return False

if __name__ == "__main__":
    print("🐛 QnA Service Debug Manager")
    success = debug_qna_service()
    if success:
        print("\n🎉 QnA service debug completed successfully!")
    else:
        print("\n💥 QnA service debug failed!") 