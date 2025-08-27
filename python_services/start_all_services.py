#!/usr/bin/env python3
"""
Start All AI Services - Comprehensive Service Orchestrator
Launches document processor, multi-agent orchestrator, and QnA service with health monitoring
"""

import os
import sys
import time
import asyncio
import subprocess
import signal
import logging
from typing import List, Dict, Any
import httpx  # Use httpx for async requests
from pathlib import Path
import json
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ServiceManager:
    """Manages all AI teaching services"""
    
    def __init__(self):
        self.services = {
            'document_processor': {
                'script': 'document_processor/main.py',
                'port': 8002,
                'health_endpoint': '/health',
                'process': None,
                'status': 'stopped'
            },
            'multi_agent_orchestrator': {
                'script': 'multi_agent_orchestrator/main.py',
                'port': 8003,
                'health_endpoint': '/health',
                'process': None,
                'status': 'stopped'
            },
            'qna_agent_service': {
                'script': 'qna_agent_service/main.py',
                'port': 8001,
                'health_endpoint': '/health',
                'process': None,
                'status': 'stopped'
            },
            'math_teaching_service': {
                'script': 'math_teaching_service/main.py',
                'port': 8004,
                'health_endpoint': '/health',
                'process': None,
                'status': 'stopped',
                'description': 'Specialized mathematics education with AI-powered step-by-step instruction'
            },
            'voice_synthesis_service': {
                'script': 'voice_synthesis_service/main.py',
                'port': 8005,
                'health_endpoint': '/health',
                'process': None,
                'status': 'stopped'
            }
        }
        
        self.processes: List[asyncio.subprocess.Process] = []
        self.shutdown_requested = False
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.shutdown_requested = True
        # The main async loop will handle the shutdown
    
    def check_prerequisites(self) -> bool:
        """Check if all prerequisites are met"""
        logger.info("Checking prerequisites...")
        
        # Check Python version
        if sys.version_info < (3, 8):
            logger.error("Python 3.8+ required")
            return False
        
        # Check if virtual environment is activated
        if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            logger.warning("Virtual environment not detected - continuing anyway")
        
        # Check required environment variables
        required_env_vars = [
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GOOGLE_AI_KEY'
        ]
        
        # Check voice synthesis providers
        voice_providers = [
            'ELEVENLABS_API_KEY',
            'AZURE_SPEECH_KEY'
        ]
        
        available_providers = 0
        missing_vars = []
        for var in required_env_vars:
            if os.getenv(var):
                available_providers += 1
            else:
                missing_vars.append(var)
        
        if available_providers == 0:
            logger.error("❌ No API keys found!")
            logger.error("At least one AI provider API key is required for the system to work.")
            logger.error("")
            logger.error("🔧 To fix this:")
            logger.error("1. Run: python setup_env.py")
            logger.error("2. Edit the .env file with your API keys")
            logger.error("3. Restart this script")
            logger.error("")
            logger.error("You can get API keys from:")
            logger.error("- OpenAI: https://platform.openai.com/api-keys")
            logger.error("- Anthropic: https://console.anthropic.com/")
            logger.error("- Google AI: https://makersuite.google.com/app/apikey")
            return False
        elif available_providers < 3:
            logger.warning(f"⚠️  Only {available_providers}/3 AI providers configured")
            logger.warning(f"Missing environment variables: {missing_vars}")
            logger.warning("The system will work but having multiple providers improves reliability")
            logger.warning("Run 'python setup_env.py' for setup assistance")
        else:
            logger.info("✅ All AI providers configured")
        
        # Check voice synthesis providers
        available_voice_providers = 0
        missing_voice_vars = []
        for var in voice_providers:
            if os.getenv(var):
                available_voice_providers += 1
            else:
                missing_voice_vars.append(var)
        
        if available_voice_providers == 0:
            logger.warning("⚠️ No premium voice providers configured!")
            logger.warning("System will use gTTS as fallback, but consider adding:")
            logger.warning("- ElevenLabs API Key: https://elevenlabs.io/")
            logger.warning("- Azure Speech Key: https://portal.azure.com/")
        elif available_voice_providers == 1:
            logger.info(f"✅ 1 premium voice provider configured")
        else:
            logger.info(f"✅ {available_voice_providers} premium voice providers configured - excellent!")
        
        # Check if .env file exists
        if not Path('.env').exists():
            logger.warning("No .env file found. Run 'python setup_env.py' to create one.")
        
        # Check if storage directories exist
        storage_path = Path('./storage')
        if not storage_path.exists():
            logger.info("Creating storage directories...")
            (storage_path / 'documents' / 'user_uploads').mkdir(parents=True, exist_ok=True)
            (storage_path / 'documents' / 'processed').mkdir(parents=True, exist_ok=True)
            (storage_path / 'documents' / 'thumbnails').mkdir(parents=True, exist_ok=True)
            (storage_path / 'vector_db').mkdir(parents=True, exist_ok=True)
            logger.info("Storage directories created")
        
        logger.info("Prerequisites check completed")
        return True
    
    async def start_service(self, service_name: str) -> bool:
        """Start a specific service asynchronously"""
        if service_name not in self.services:
            logger.error(f"Unknown service: {service_name}")
            return False
        
        service = self.services[service_name]
        
        if service['status'] == 'running':
            logger.warning(f"Service {service_name} is already running")
            return True
        
        logger.info(f"🚀 Starting {service_name}...")
        
        try:
            # Prepare environment
            env = os.environ.copy()
            env.update({
                'PYTHONPATH': str(Path(__file__).parent.absolute()),
                'DOCUMENT_PROCESSOR_PORT': str(self.services['document_processor']['port']),
                'ORCHESTRATOR_PORT': str(self.services['multi_agent_orchestrator']['port']),
                'QNA_SERVICE_PORT': str(self.services['qna_agent_service']['port']),
                'TEACHING_CONTENT_PORT': str(self.services['math_teaching_service']['port']),
                'VOICE_SYNTHESIS_PORT': str(self.services['voice_synthesis_service']['port']),
                'TEACHING_CONTENT_SERVICE_URL': f"http://localhost:{self.services['math_teaching_service']['port']}",
                'VOICE_SYNTHESIS_SERVICE_URL': f"http://localhost:{self.services['voice_synthesis_service']['port']}",
                'FILE_STORAGE_PATH': str(Path('./storage/documents').absolute()),
                'VECTOR_DB_TYPE': 'chromadb'
            })
            
            # All services are FastAPI apps, so we can start them with uvicorn
            script_path = service['script']
            module_name = script_path.replace('.py', '').replace('/', '.')
            
            cmd = [
                sys.executable, '-m', 'uvicorn', 
                f"{module_name}:app",
                '--host', '0.0.0.0', '--port', str(service['port'])
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=Path(__file__).parent,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            service['process'] = process
            service['status'] = 'starting'
            self.processes.append(process)
            
            # Asynchronously wait for the service to become healthy
            if await self._wait_for_service_health(service_name, timeout=300):
                service['status'] = 'running'
                logger.info(f"✅ {service_name} started successfully on port {service['port']}")
                return True
            else:
                logger.error(f"❌ {service_name} failed to start after extended timeout.")
                
                # Capture and display error output for debugging
                try:
                    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=5.0)
                    if stderr:
                        logger.error(f"Error output from {service_name}:")
                        logger.error(stderr.decode(errors='ignore'))
                    if stdout:
                        logger.info(f"Standard output from {service_name}:")
                        logger.info(stdout.decode(errors='ignore'))
                except asyncio.TimeoutError:
                    logger.error(f"Could not get output from {service_name}, process may be stuck.")
                except Exception as e:
                    logger.error(f"Error getting output from {service_name}: {e}")

                # Ensure process is terminated if it failed to start properly
                if process.returncode is None:
                    try:
                        process.terminate()
                        await process.wait()
                        logger.info(f"Terminated unresponsive {service_name} process (PID: {process.pid})")
                    except ProcessLookupError:
                        pass # Process already died
                    except Exception as e:
                        logger.error(f"Error terminating process for {service_name}: {e}")
                
                service['status'] = 'failed'
                return False
                
        except Exception as e:
            logger.error(f"An unexpected error occurred while starting {service_name}: {str(e)}")
            service['status'] = 'failed'
            return False

    async def _wait_for_service_health(self, service_name: str, timeout: int = 300) -> bool:
        """Asynchronously wait for a service to become healthy with detailed logging."""
        service = self.services[service_name]
        url = f"http://localhost:{service['port']}{service['health_endpoint']}"
        start_time = time.time()
        
        logger.info(f"Waiting for {service_name} to become healthy at {url}...")
        
        last_log_time = start_time
        log_interval = 10 # seconds

        while time.time() - start_time < timeout:
            if self.shutdown_requested:
                return False

            current_time = time.time()
            elapsed = int(current_time - start_time)

            if current_time - last_log_time >= log_interval:
                status_message = f"Waiting for {service_name} ({elapsed}s elapsed)..."
                if "document_processor" in service_name and elapsed > 20:
                    status_message += " (This can take a few minutes while AI models are loading)"
                logger.info(status_message)
                last_log_time = current_time

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(url, timeout=5)
                
                if response.status_code == 200:
                    health_status = response.json()
                    # Deeper check for services that might have a staged startup
                    if "status" in health_status and health_status["status"] == "healthy":
                        logger.info(f"💚 {service_name} is healthy!")
                        return True
                    elif "status" in health_status and health_status["status"] == "starting":
                        logger.info(f"🟡 {service_name} is still starting (e.g., loading models)...")
                
            except httpx.RequestError:
                # This is expected while the service is starting up
                pass
            except Exception as e:
                logger.warning(f"Health check for {service_name} encountered an error: {e}")

            await asyncio.sleep(2) # Check every 2 seconds
            
        logger.error(f"💔 {service_name} did not become healthy within the {timeout}s timeout.")
        return False
        
    async def start_all_services(self) -> bool:
        """Start all services concurrently"""
        logger.info("🚀 Starting all AI teaching services concurrently...")
        
        # Start services with potential dependencies first, though concurrently.
        # This is more of a good practice in case of future strict dependencies.
        service_names = list(self.services.keys())
        
        tasks = [self.start_service(name) for name in service_names]
        results = await asyncio.gather(*tasks)
        
        if all(results):
            logger.info("✅ All services started successfully!")
            self._print_service_status()
            return True
        else:
            logger.error("❌ Some services failed to start. Aborting.")
            await self.stop_all_services()
            return False

    def stop_service(self, service_name: str):
        """Stop a specific service (kept for potential single service ops, but shutdown is async)"""
        # This is a synchronous remnant; primary shutdown is `stop_all_services`
        service = self.services[service_name]
        process = service.get('process')
        if process and process.returncode is None:
             logger.info(f"Stopping {service_name} (PID: {process.pid})...")
             process.terminate()
             service['status'] = 'stopped'

    async def stop_all_services(self):
        """Stop all running services asynchronously"""
        logger.info("Stopping all services...")
        
        tasks = []
        for service_name, service in self.services.items():
            process = service.get('process')
            if process and process.returncode is None:
                logger.info(f"Requesting shutdown for {service_name} (PID: {process.pid})...")
                
                async def terminate_and_wait(p, s_name):
                    try:
                        p.terminate()
                        await asyncio.wait_for(p.wait(), timeout=10)
                        logger.info(f"Stopped {s_name}")
                    except ProcessLookupError:
                        logger.warning(f"Process for {s_name} not found.")
                    except asyncio.TimeoutError:
                        logger.warning(f"Graceful shutdown of {s_name} timed out. Killing.")
                        try:
                            p.kill()
                            await p.wait()
                        except Exception as e:
                            logger.error(f"Error killing {s_name}: {e}")
                    except Exception as e:
                        logger.error(f"Error stopping {s_name}: {e}")

                tasks.append(terminate_and_wait(process, service_name))
                service['status'] = 'stopped'
                service['process'] = None
        
        if tasks:
            await asyncio.gather(*tasks)

        self.processes.clear()
        logger.info("All services stopped")
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get status of all services"""
        status_report = {'services': {}}
        for name, service in self.services.items():
            pid = service['process'].pid if service.get('process') else None
            status_report['services'][name] = {
                'status': service['status'],
                'port': service['port'],
                'pid': pid
            }
        return status_report

    def _print_service_status(self):
        """Print the status of all services in a formatted table"""
        logger.info("📊 Current Service Status:")
        
        status_data = self.get_service_status()
        
        # Table header
        header = f"| {'Service Name':<28} | {'Status':<10} | {'Port':<6} | {'PID':<8} |"
        separator = f"|{'-'*30}|{'-'*12}|{'-'*8}|{'-'*10}|"
        
        logger.info(header)
        logger.info(separator)
        
        for service_name, details in status_data['services'].items():
            pid_str = str(details['pid']) if details['pid'] else 'N/A'
            row = f"| {service_name:<28} | {details['status']:<10} | {details['port']:<6} | {pid_str:<8} |"
            logger.info(row)
        
        logger.info(separator)

    async def monitor_services(self):
        """Monitor running services and restart if necessary"""
        logger.info("Service monitor started. Press Ctrl+C to shut down.")
        while not self.shutdown_requested:
            for name, service in self.services.items():
                if service['status'] == 'running':
                    process = service.get('process')
                    if process and process.returncode is not None:
                        logger.warning(f"Service {name} has terminated unexpectedly with code {process.returncode}. Restarting...")
                        # Ensure old process is cleared before starting a new one
                        service['process'] = None
                        service['status'] = 'stopped'
                        await self.start_service(name)
            
            await asyncio.sleep(10) # Check every 10 seconds

    def create_status_report(self) -> Dict[str, Any]:
        """Generate a JSON status report"""
        status_data = self.get_service_status()
        report = {
            'timestamp': datetime.utcnow().isoformat(),
            'overall_status': 'all_running' if all(s['status'] == 'running' for s in status_data['services'].values()) else 'degraded',
            'services': status_data['services']
        }
        return report

async def main():
    """Main function to run the service manager"""
    print("🤖 Lucid Learn AI - Service Manager")
    print("Starting intelligent multi-agent teaching platform...")
    print("-" * 50)
    
    manager = ServiceManager()
    
    # Setup signal handling for the event loop
    loop = asyncio.get_running_loop()
    
    # Use different signals for Windows and other OSes for graceful shutdown
    signals_to_handle = {signal.SIGINT}
    if sys.platform != "win32":
        signals_to_handle.add(signal.SIGTERM)

    for sig in signals_to_handle:
        try:
            loop.add_signal_handler(sig, manager._signal_handler, sig, None)
            logger.info(f"Registered signal handler for {sig.name}")
        except (ValueError, AttributeError, NotImplementedError):
            logger.warning(f"Could not set signal handler for signal {sig}. Graceful shutdown on this signal may not work.")

    if not manager.check_prerequisites():
        sys.exit(1)
    
    main_task = None
    try:
        if await manager.start_all_services():
            main_task = asyncio.create_task(manager.monitor_services())
            await main_task
        else:
            logger.error("Failed to start all services")
            sys.exit(1)
            
    except asyncio.CancelledError:
        logger.info("Main task cancelled.")
    finally:
        if main_task and not main_task.done():
            main_task.cancel()
        await manager.stop_all_services()
        logger.info("Service manager shutdown complete")


if __name__ == "__main__":
    # Add httpx to requirements if it's not there
    try:
        import httpx
    except ImportError:
        print("Installing httpx for asynchronous requests...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx"])

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown requested by user.")
    except Exception as e:
        logger.error(f"A critical error occurred: {e}", exc_info=True) 