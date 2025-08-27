import logging
import asyncio
import sys

try:
    from .content_agent import ContentDraftingAgent
except ImportError:
    # Fallback for direct script execution
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from content_agent import ContentDraftingAgent

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("ContentDraftingAgentSubprocess")
    logger.info("[SUBPROCESS] Starting ContentDraftingAgent worker-1...")
    try:
        asyncio.run(ContentDraftingAgent("worker-1").run())
        logger.info("[SUBPROCESS] ContentDraftingAgent worker-1 completed successfully.")
    except Exception as e:
        logger.error(f"[SUBPROCESS] ContentDraftingAgent worker-1 failed: {e}", exc_info=True)
        exit(1)
    exit(0) 