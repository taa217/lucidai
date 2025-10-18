"""Vercel serverless entrypoint for the Q&A FastAPI app.

Rewrites the ASGI scope path to strip the "/api/qna" prefix so FastAPI
routes like "/health" resolve correctly on Vercel.
"""

from qna_agent_service.main import app as fastapi_app  # underlying ASGI app

PREFIX = "/api/qna"

async def app(scope, receive, send):  # ASGI entrypoint expected by Vercel
    if scope.get("type") in {"http", "websocket"}:
        path = scope.get("path", "")
        if path.startswith(PREFIX):
            scope = {**scope, "path": path[len(PREFIX):] or "/"}
    await fastapi_app(scope, receive, send)


