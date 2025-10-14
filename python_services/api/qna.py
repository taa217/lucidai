"""Vercel serverless entrypoint for the Q&A FastAPI app.

This exposes the FastAPI `app` so Vercel's Python runtime can serve it
under the /api/qna path (configure FASTAPI_ROOT_PATH=/api/qna on Vercel).
"""

from qna_agent_service.main import app  # ASGI app expected by Vercel


