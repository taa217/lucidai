"""Test script for enhanced ResearchAgent with OpenAI web search."""

import asyncio
import logging
import os
from pathlib import Path

# Set up environment
parent_dir = Path(__file__).parent.parent
os.environ["PYTHONPATH"] = str(parent_dir)

from research_agent import ResearchAgent
from shared_memory import memory_table

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger(__name__)


async def test_research_agent():
    """Test the enhanced research agent with real web search."""
    
    logger.info("🧪 Testing enhanced ResearchAgent with OpenAI web search...")
    
    # Clear any existing research tasks
    with memory_table("research_tasks") as db:
        db.clear()
    
    # Create a test research task
    test_task_id = "test-research-001"
    test_task = {
        "id": test_task_id,
        "objective": "Find authoritative sources about machine learning fundamentals",
        "search_queries": [
            "machine learning fundamentals tutorial",
            "supervised learning explained",
            "neural network basics"
        ],
        "status": "pending"
    }
    
    # Add task to shared memory
    with memory_table("research_tasks") as db:
        db[test_task_id] = test_task
    
    logger.info(f"📋 Created test research task: {test_task['objective']}")
    
    # Start research agent
    research_agent = ResearchAgent("test-agent")
    research_task = asyncio.create_task(research_agent.run())
    
    # Wait for task completion (with timeout)
    try:
        # Give it 60 seconds max
        await asyncio.wait_for(
            wait_for_task_completion(test_task_id),
            timeout=60.0
        )
        
        # Cancel the research agent task
        research_task.cancel()
        
        # Check results
        with memory_table("research_tasks") as db:
            result = db.get(test_task_id)
            
        if result and result.get("status") == "done":
            logger.info("✅ Research task completed successfully!")
            logger.info(f"🔍 Search queries used: {result.get('search_queries_used', [])}")
            logger.info(f"📊 Total sources found: {result.get('total_sources_found', 0)}")
            
            sources = result.get("result", [])
            if sources:
                logger.info("📚 Top sources found:")
                for i, source in enumerate(sources[:3], 1):
                    logger.info(f"  {i}. {source.get('title', 'Unknown')}")
                    logger.info(f"     {source.get('url', 'No URL')}")
                    logger.info(f"     Score: {source.get('relevance_score', 0):.2f}")
            else:
                logger.warning("⚠️ No sources found in results")
                
        else:
            logger.error(f"❌ Research task failed or incomplete: {result}")
            return False
            
    except asyncio.TimeoutError:
        logger.error("❌ Test timed out after 60 seconds")
        research_task.cancel()
        return False
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        research_task.cancel()
        return False
    
    logger.info("🎉 Research agent test completed successfully!")
    return True


async def wait_for_task_completion(task_id: str):
    """Wait for a specific task to be completed."""
    while True:
        with memory_table("research_tasks") as db:
            task = db.get(task_id)
            if task and task.get("status") in ["done", "failed"]:
                return
        await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(test_research_agent()) 