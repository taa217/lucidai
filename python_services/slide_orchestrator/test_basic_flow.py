"""Test script for the basic multi-agent slide orchestrator flow."""

import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from slide_orchestrator.graph import run_demo
from slide_orchestrator.shared_memory import memory_table
from slide_orchestrator.checkpoint import save_checkpoint, load_checkpoint
from slide_orchestrator.state import TeachingAgentState

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_basic_flow():
    """Test the basic orchestrator flow."""
    logger.info("🚀 Starting basic multi-agent flow test...")
    
    # Clear any existing state
    for table in ["research_tasks", "content_tasks", "messages"]:
        with memory_table(table) as db:
            db.clear()
    
    # Initialize the state with current_objective set to a default value so the first worker node does not fail with KeyError.
    # This ensures the cyclical graph can start and the Lead Agent will update the objective as needed.
    state = TeachingAgentState(
        learning_goal="Understand how neural networks work",
        user_query="Explain neural networks",
        current_phase="start",
        current_objective="Conduct foundational research on neural networks.",
        research_outputs=[],
        content_outputs=[],
        visual_outputs=[],
        voice_outputs=[],
    )

    # Run the demo
    try:
        final_state = await run_demo(
            user_query="Explain neural networks", 
            learning_goal="Understand how neural networks work"
        )
        
        logger.info("✅ Flow completed successfully!")
        logger.info(f"Final phase: {final_state.get('current_phase')}")
        
        # Check what's in shared memory
        with memory_table("research_tasks") as db:
            logger.info(f"Research tasks: {dict(db)}")
            
        with memory_table("content_tasks") as db:
            logger.info(f"Content tasks: {dict(db)}")
            
        with memory_table("messages") as db:
            logger.info(f"Messages: {dict(db)}")
            
        # Test checkpoint
        save_checkpoint("test-run", final_state)
        loaded = load_checkpoint("test-run")
        logger.info(f"Checkpoint test: {'✅ PASS' if loaded else '❌ FAIL'}")
        
    except Exception as e:
        logger.error(f"❌ Flow failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(test_basic_flow()) 