"""Vercel serverless entrypoint for the Slide Orchestrator FastAPI app.

Rewrites the ASGI scope path to strip the "/api/orch" prefix so FastAPI
routes like "/health" resolve correctly on Vercel.
"""

from slide_orchestrator.api_server import app as fastapi_app  # underlying app

PREFIX = "/api/orch"

async def app(scope, receive, send):  # ASGI shim expected by Vercel
    if scope.get("type") in {"http", "websocket"}:
        path = scope.get("path", "")
        if path.startswith(PREFIX):
            scope = {**scope, "path": path[len(PREFIX):] or "/"}
    await fastapi_app(scope, receive, send)


