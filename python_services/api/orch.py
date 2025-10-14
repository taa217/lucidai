"""Vercel serverless entrypoint for the Slide Orchestrator FastAPI app.

Expose the ASGI `app` for Vercel. Set FASTAPI_ROOT_PATH=/api/orch so routes
resolve correctly when deployed under /api/orch/*.
"""

from slide_orchestrator.api_server import app  # ASGI app expected by Vercel


