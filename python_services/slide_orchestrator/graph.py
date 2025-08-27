"""Bootstrapped LangGraph graph with placeholder nodes.

Phase 1.4 — basic StateGraph wired with voice synthesis.
"""

from __future__ import annotations

import asyncio
import uuid
import logging
import subprocess
import sys
from typing import Any, Dict

import nest_asyncio
nest_asyncio.apply()

from langgraph.graph import StateGraph, START, END

from .state import TeachingAgentState, initial_state
import os
from .lead_agent import LeadTeachingAgent
from .shared_memory import memory_table
from .research_agent import ResearchAgent
from .content_agent import ContentDraftingAgent
from .visual_designer_agent import VisualDesignerAgent
from .voice_synthesis_agent import VoiceSynthesisAgent

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- WORKER NODES ---

async def run_research(state: TeachingAgentState) -> TeachingAgentState:
    """Worker node to run the research phase."""
    logger.info("🔬 Executing RESEARCH phase...")
    task_id = str(uuid.uuid4())
    with memory_table("research_tasks") as db:
        db[task_id] = {
            "id": task_id,
            "status": "pending",
            "objective": state["current_objective"],
            "learning_goal": state["learning_goal"]
        }
    # Spawn and run the research agent
    research_agent = ResearchAgent("worker-1")
    research_task = asyncio.create_task(research_agent.run())
    # Wait for the task to complete with reduced timeout
    await _wait_for_task(table="research_tasks", task_id=task_id, timeout=120)  # Reduced from 300 to 120 seconds
    research_task.cancel() # Stop the agent's infinite loop
    # Collect results
    with memory_table("research_tasks") as db:
        state["research_outputs"] = [task for task in db.values() if task.get("status") == "done"]
    logger.info(f"✅ Research phase complete. Collected {len(state['research_outputs'])} outputs.")
    return state

async def run_content(state: TeachingAgentState) -> TeachingAgentState:
    """Worker node to run the content drafting phase."""
    logger.info("📝 Executing CONTENT phase...")
    # 1. Reuse or create a content task
    with memory_table("content_tasks") as db:
        existing = [(tid, meta) for tid, meta in db.items() if meta.get("status") in ("pending", "in_progress")]
        if existing:
            task_id, meta = existing[0]
            logger.info(f"📝 Using existing content task: {task_id} ({meta.get('status')})")
        else:
            task_id = str(uuid.uuid4())
            db[task_id] = {
                "id": task_id,
                "status": "pending",
                "objective": state["current_objective"],
                "learning_goal": state["learning_goal"],
            }
            logger.info(f"📝 Created content task: {task_id}")

    # 2. Start the content agent if needed
    start_agent = False
    with memory_table("content_tasks") as db:
        if db.get(task_id, {}).get("status") == "pending":
            start_agent = True
    if start_agent:
        content_agent = ContentDraftingAgent("worker-1")
        asyncio.create_task(content_agent.run())
        logger.info("🚀 Content agent started in background")

    # 3. Return as soon as at least one slide exists to allow per-slide interleaving
    logger.info("⏳ Waiting for first slide(s) to appear...")
    for _ in range(240):
        with memory_table("content_tasks") as db:
            slides = (db.get(task_id, {}).get("slides") or [])
            if slides:
                logger.info(f"✅ Detected {len(slides)} slide(s). Allowing visuals/voice to proceed.")
                break
        await asyncio.sleep(0.5)

    # 4. Capture any finished content tasks
    with memory_table("content_tasks") as db:
        state["content_outputs"] = [task for task in db.values() if task.get("status") == "done"]
    return state

async def run_visuals(state: TeachingAgentState) -> TeachingAgentState:
    logger.info("🎨 Executing VISUAL phase...")
    # 1. Reuse the task the Lead agent created if present; otherwise create one
    with memory_table("visual_tasks") as db:
        pending_items = [(tid, meta) for tid, meta in db.items() if meta.get("status") == "pending"]
        if pending_items:
            task_id, _ = pending_items[0]
            logger.info(f"🎨 Using existing visual task from planner/supervisor: {task_id}")
        else:
            # Only create a fallback task in legacy mode
            if os.getenv("SLIDES_PLANNER", "legacy").lower() == "legacy":
                task_id = str(uuid.uuid4())
                db[task_id] = {
                    "id": task_id,
                    "status": "pending",
                    "objective": state["current_objective"],
                    "learning_goal": state["learning_goal"],
                }
                logger.info(f"🎨 Created fallback visual task: {task_id}")
            else:
                logger.info("🎨 Supervisor mode: no fallback visual task created")
                return state

    # 2. Spawn and run the visual agent asynchronously
    visual_agent = VisualDesignerAgent("worker-1")
    visual_task = asyncio.create_task(visual_agent.run())

    # 3. Wait for THAT SPECIFIC task to complete with reduced timeout
    await _wait_for_task(table="visual_tasks", task_id=task_id, timeout=120)  # Reduced from 300 to 120 seconds
    visual_task.cancel()  # Stop the agent's infinite loop once its job is done

    # 4. Collect the results
    with memory_table("visual_tasks") as db:
        state["visual_outputs"] = [task for task in db.values() if task.get("status") == "done"]
    logger.info(f"✅ Visual phase complete. Collected {len(state['visual_outputs'])} outputs.")
    return state

async def run_voice_and_collect_results(state: TeachingAgentState) -> TeachingAgentState:
    """
    Worker node to create, execute, and collect voice synthesis tasks in a single, robust step.
    """
    logger.info("🔊 Executing VOICE phase...")
    # Pull available slides directly from content memory for incremental voice
    all_slides = []
    with memory_table("content_tasks") as db:
        for rec in db.values():
            all_slides.extend(rec.get("slides", []) or [])
    if not all_slides:
        logger.warning("⚠️ No slides ready for voice. Skipping this iteration.")
        state["voice_outputs"] = []
        return state

    # --- Task Creation ---
    tasks_created = 0
    with memory_table("voice_tasks") as db:
        # Avoid duplicate per-slide tasks
        existing_slide_numbers = {task.get("slide_number") for task in db.values()}
        for slide in all_slides:
            slide_number = slide.get("slide_number")
            speaker_notes = slide.get("speaker_notes")
            if speaker_notes and slide_number not in existing_slide_numbers and not slide.get("audio_url"):
                task_id = str(uuid.uuid4())
                db[task_id] = {
                    "id": task_id,
                    "status": "pending",
                    "objective": f"Generate voice for slide {slide_number}",
                    "slide_number": slide_number,
                    "speaker_notes": speaker_notes,
                }
                tasks_created += 1
    logger.info(f"📝 Created {tasks_created} new voice synthesis tasks.")

    # --- Agent Execution ---
    # Only run the agent if new tasks were actually created.
    if tasks_created > 0:
        voice_agent = VoiceSynthesisAgent("worker-1")
        await voice_agent.run()
        logger.info("✅ Voice agent batch run has been initiated.")
    else:
        if os.getenv("SLIDES_PLANNER", "legacy").lower() == "legacy":
            logger.info("No new voice tasks to create. Proceeding to collection.")
        else:
            logger.info("Supervisor mode: no voice tasks created; skipping execution.")
            state["voice_outputs"] = []
            return state
    
    # --- Result Collection with Polling (CRITICAL FIX) ---
    # Use the robust polling mechanism to wait for all tasks to be finalized.
    await _wait_for_all_tasks("voice_tasks", timeout=60)  # Reduced from 180 to 60 seconds

    logger.info("📥 Collecting all voice synthesis results...")
    with memory_table("voice_tasks") as db:
        db.sync()  # Sync one last time to ensure we have the absolute latest state
        all_finished_tasks = list(db.values())
        
    done_tasks = [
        task for task in all_finished_tasks
        if task.get("status") == "done" and task.get("audio_url")
    ]
    failed_tasks = [
        task for task in all_finished_tasks if task.get("status") == "failed"
    ]
    if failed_tasks:
        logger.warning(f"⚠️ Found {len(failed_tasks)} failed voice tasks.")

    state["voice_outputs"] = done_tasks
    logger.info(f"✅ Collected {len(done_tasks)} completed voice tasks.")

    # --- Integration ---
    if done_tasks:
        with memory_table("content_tasks") as db:
            for tid, rec in db.items():
                slides = rec.get("slides", []) or []
                for s in slides:
                    for voice_task in done_tasks:
                        if s.get("slide_number") == voice_task.get("slide_number"):
                            s["audio_url"] = voice_task.get("audio_url")
                            s["audio_duration"] = voice_task.get("duration_seconds")
                            # bump version to surface an explicit change for streaming
                            try:
                                s["version"] = int(s.get("version", 0)) + 1
                            except Exception:
                                s["version"] = 1
                            db[tid] = rec
                            logger.info(f"🔗 Integrated audio for slide {s.get('slide_number')}.")
                            try:
                                from .shared_memory import append_event  # type: ignore
                                append_event({
                                    "type": "voice_ready",
                                    "payload": {
                                        "slide_number": s.get("slide_number"),
                                        "audio_url": s.get("audio_url"),
                                        "duration": s.get("audio_duration"),
                                    }
                                })
                            except Exception:
                                pass
    
    return state

async def assembly_final_deck(state: TeachingAgentState) -> TeachingAgentState:
    """Merges all generated assets into a final, coherent slide deck."""
    logger.info("🔧 Executing ASSEMBLY phase...")

    if not state.get("content_outputs"):
        logger.warning("No content to assemble. Skipping assembly.")
        return state

    # Start with the base slides from the content phase
    # Handle multiple content tasks by merging all slides
    all_slides = []
    for content_task in state.get("content_outputs", []):
        task_slides = content_task.get("slides", [])
        all_slides.extend(task_slides)
        logger.info(f"📝 Merged {len(task_slides)} slides from content task")
    
    if not all_slides:
        logger.warning("No slides found in content outputs. Skipping assembly.")
        return state
    
    slide_map = {s["slide_number"]: s for s in all_slides}

    # Merge visual assets into the slides
    if state.get("visual_outputs"):
        # Handle multiple visual tasks by merging all assets
        all_visual_assets = []
        for visual_task in state["visual_outputs"]:
            task_assets = visual_task.get("visual_assets", [])
            all_visual_assets.extend(task_assets)
            logger.info(f"🎨 Merged {len(task_assets)} visual assets from visual task")
        
        for asset in all_visual_assets:
            slide_number = asset.get("slide_number")
            if slide_number in slide_map:
                if "contents" not in slide_map[slide_number]:
                    slide_map[slide_number]["contents"] = []
                # Append the visual asset to the slide's content list
                slide_map[slide_number]["contents"].append(asset)
                logger.info(f"🎨 Merged visual asset into slide {slide_number}")

    # Merge voice assets into the slides
    if state.get("voice_outputs"):
        for asset in state["voice_outputs"]:
            slide_number = asset.get("slide_number")
            if slide_number in slide_map:
                slide_map[slide_number]["audio_url"] = asset.get("audio_url")
                slide_map[slide_number]["audio_duration"] = asset.get("duration_seconds")
                logger.info(f"🎙️ Merged audio into slide {slide_number}")
    
    # --- Final auto-layout to prevent overlaps and improve readability ---
    def _auto_layout_slide(slide: Dict[str, Any]) -> Dict[str, Any]:
        try:
            layout = (slide.get("layout") or "bullet_points").lower()
            contents = list(slide.get("contents", []) or [])

            # Partition by type
            text_like = [c for c in contents if c.get("type") in ("text", "bullet_list")]
            visuals = [c for c in contents if c.get("type") in ("image", "diagram", "mermaid_diagram", "conceptual_diagram", "educational_image")]
            others = [c for c in contents if c not in text_like and c not in visuals]

            def place_text_items(items: list[Dict[str, Any]], x: int = 6, y_start: int = 16, y_step: int = 10) -> None:
                y = y_start
                for item in items:
                    # Estimate extra height for bullet lists based on count
                    if item.get("type") == "bullet_list":
                        bullets = item.get("value") or []
                        estimated_h = max(10, 6 + 2 * min(10, len(bullets)))
                    else:
                        estimated_h = 10
                    item["position"] = {"x": x, "y": min(92, y)}
                    y += max(y_step, estimated_h)

            def place_visuals(items: list[Dict[str, Any]], x: int = 64, y_start: int = 30, y_step: int = 20) -> None:
                y = y_start
                for item in items:
                    # Use existing size hint or default
                    size = item.get("size") or {}
                    item_width = int(size.get("width", 34))
                    item_height = int(size.get("height", 30))
                    item["position"] = {"x": x, "y": min(90, y)}
                    item["size"] = {"width": min(95 - x, item_width), "height": item_height}
                    y += max(y_step, int(item_height * 0.6))

            # Strategy per layout
            if layout == "text_image":
                place_text_items(text_like, x=6, y_start=16, y_step=12)
                place_visuals(visuals, x=60, y_start=24, y_step=24)
            elif layout == "full_text":
                place_text_items(text_like, x=8, y_start=16, y_step=12)
                place_visuals(visuals, x=58, y_start=34, y_step=20)
            elif layout == "diagram":
                # Emphasize diagram on the right, text at top-left
                place_text_items(text_like, x=6, y_start=10, y_step=8)
                place_visuals(visuals, x=58, y_start=26, y_step=20)
            else:  # bullet_points and fallback
                place_text_items(text_like, x=6, y_start=16, y_step=10)
                place_visuals(visuals, x=64, y_start=36, y_step=22)

            # Recombine preserving others
            slide["contents"] = text_like + visuals + others
        except Exception:
            logger.exception(f"Auto-layout failed for slide {slide.get('slide_number')}")
        return slide

    final_slides = [
        _auto_layout_slide(slide_map[num]) for num in sorted(slide_map.keys())
    ]

    # Store the fully assembled deck in a new state key
    state["final_deck"] = final_slides
    logger.info("✅ Assembly complete. Final deck is ready.")
    return state

# --- UTILITY WAIT FUNCTIONS ---

async def _wait_for_task(table: str, task_id: str, timeout: int = 30):  # Reduced from 60 to 30 seconds
    for _ in range(timeout * 2):
        with memory_table(table) as db:
            if db.get(task_id, {}).get("status") == "done":
                logger.info(f"✅ Task {task_id} in '{table}' is done.")
                return
        await asyncio.sleep(0.5)
    logger.warning(f"⚠️ Timeout waiting for task {task_id} in '{table}'.")

async def _wait_for_all_tasks(table: str, timeout: int = 60):  # Reduced from 120 to 60 seconds
    """
    Waits until all tasks in a table are either 'done' or 'failed'.
    """
    logger.info(f"⏳ Waiting for all tasks in '{table}' to complete...")
    for i in range(timeout * 2):
        # Add a small initial delay to allow the filesystem to catch up
        if i == 0:
            await asyncio.sleep(0.5)

        with memory_table(table) as db:
            # Force the dictionary to re-read from the database file.
            db.sync()

            if not db:
                await asyncio.sleep(0.5)
                continue

            statuses = [task.get("status", "pending") for task in db.values()]
            if all(s in ("done", "failed") for s in statuses):
                done_count = statuses.count("done")
                failed_count = statuses.count("failed")
                logger.info(f"✅ All tasks in '{table}' have completed. Success: {done_count}, Failed: {failed_count}.")
                return

        await asyncio.sleep(0.5)
    logger.warning(f"⚠️ Timeout waiting for all tasks in '{table}'.")

# --- CONDITIONAL ROUTER ---
def route_based_on_phase(state: TeachingAgentState) -> str:
    """
    Enhanced routing that respects the Lead Agent's intelligent decisions.
    This is no longer just a hardcoded sequence - it follows the Lead Agent's planning.
    """
    current_phase = state.get("current_phase", "complete")
    planning_metadata = state.get("planning_metadata", {})
    reasoning = planning_metadata.get("reasoning", "No reasoning provided")
    iteration_count = state.get("iteration_count", 0)
    
    # CRITICAL SAFETY CHECK: Prevent infinite loops but allow full pipeline to finish
    # Increase budget to cover all phases (planner is called between each phase)
    MAX_ITERATIONS = 12  # Allows: research → content → visual → voice → assembly → complete
    if iteration_count >= MAX_ITERATIONS:
        logger.warning(f"⚠️ MAX ITERATIONS ({MAX_ITERATIONS}) REACHED! Applying safe fallback routing.")
        logger.warning(f"⚠️ Current iteration: {iteration_count}, Phase: {current_phase}")
        # If we already have content, try to assemble instead of aborting
        if state.get("content_outputs"):
            logger.info("🔧 Fallback: routing to 'assembly' to build final deck before ending")
            return "assembly"
        return "END"
    
    logger.info(f"🧠 ROUTING based on Lead Agent decision: '{current_phase}' (Iteration: {iteration_count})")
    logger.info(f"📋 Reasoning: {reasoning}")
    
    # Route based on the Lead Agent's intelligent decision
    if current_phase == "research":
        logger.info("🔬 Lead Agent decided: Research phase needed")
        return "run_research"
    elif current_phase == "content":
        logger.info("📝 Lead Agent decided: Content creation needed")
        return "run_content"
    elif current_phase == "visual":
        logger.info("🎨 Lead Agent decided: Visual design needed")
        return "run_visuals"
    elif current_phase == "voice":
        logger.info("🎙️ Lead Agent decided: Voice synthesis needed")
        return "run_voice"
    elif current_phase == "assembly":
        logger.info("🔧 Lead Agent decided: Assembly phase needed")
        return "assembly"
    elif current_phase == "complete":
        logger.info("✅ Lead Agent decided: All phases complete")
        return "END"
    else:
        logger.warning(f"⚠️ Unknown phase '{current_phase}', defaulting to END")
        return "END"

# --- GRAPH WIRING ---
def build_basic_graph(StateGraph, END):
    """Return a compiled LangGraph with a central planner and worker nodes."""
    logger.info("🏗️ Building cyclical agent graph...")
    graph = StateGraph(TeachingAgentState)
    # Register the planner and all worker nodes
    graph.add_node("lead_planner", LeadTeachingAgent())
    graph.add_node("run_research", run_research)
    graph.add_node("run_content", run_content)
    graph.add_node("run_visuals", run_visuals)
    # This single node now handles voice creation, execution, and collection
    graph.add_node("run_voice", run_voice_and_collect_results)
    graph.add_node("assembly", assembly_final_deck)
    # The graph starts with the planner
    graph.set_entry_point("lead_planner")
    # Add the conditional router
    graph.add_conditional_edges(
        "lead_planner",
        route_based_on_phase,
        {
            "run_research": "run_research",
            "run_content": "run_content",
            "run_visuals": "run_visuals",
            "run_voice": "run_voice",
            "assembly": "assembly",
            "END": END
        }
    )
    # Add edges from all worker nodes back to the planner to create the loop
    graph.add_edge("run_research", "lead_planner")
    graph.add_edge("run_content", "lead_planner")
    graph.add_edge("run_visuals", "lead_planner")
    # CRITICAL FIX: The voice phase is now a single step.
    graph.add_edge("run_voice", "lead_planner")
    graph.add_edge("assembly", "lead_planner")
    logger.info("✅ Cyclical graph built successfully")
    return graph.compile()


# ---------------------------------------------------------------------------
# Convenience runner ---------------------------------------------------------
# ---------------------------------------------------------------------------


async def run_demo(user_query: str, learning_goal: str) -> Dict[str, Any]:
    """Run the basic graph once to verify wiring."""

    logger.info("🚀 Starting LangGraph demo pipeline")
    logger.info(f"📝 User Query: {user_query}")
    logger.info(f"🎯 Learning Goal: {learning_goal}")

    graph = build_basic_graph(StateGraph, END)
    state = initial_state(user_query, learning_goal)
    
    logger.info("📊 Initial State:")
    for key, value in state.items():
        if isinstance(value, (list, dict)) and len(str(value)) > 100:
            logger.info(f"   {key}: {type(value).__name__} with {len(value)} items")
        else:
            logger.info(f"   {key}: {value}")
    
    logger.info("🔄 Executing graph...")
    
    # CRITICAL SAFETY: Add timeout to prevent infinite execution
    try:
        # Execute with timeout to prevent infinite loops
        final_state = await asyncio.wait_for(
            graph.ainvoke(state),
            timeout=1800  # 30 minutes maximum execution time
        )
        logger.info("✅ Graph execution completed within timeout!")
    except asyncio.TimeoutError:
        logger.error("❌ Graph execution timed out after 30 minutes!")
        # Return partial state with error
        state["error_log"].append("Graph execution timed out after 30 minutes")
        state["current_phase"] = "complete"
        # Best-effort assembly before returning
        try:
            state = await assembly_final_deck(state)
        except Exception:
            logger.exception("Assembly fallback failed after timeout")
        return state
    except Exception as e:
        logger.error(f"❌ Graph execution failed: {e}")
        state["error_log"].append(f"Graph execution failed: {str(e)}")
        state["current_phase"] = "complete"
        # Best-effort assembly before returning
        try:
            state = await assembly_final_deck(state)
        except Exception:
            logger.exception("Assembly fallback failed after exception")
        return state
    
    logger.info("✅ Graph execution completed!")
    logger.info("📊 Final State Summary:")
    for key, value in final_state.items():
        if isinstance(value, (list, dict)) and len(str(value)) > 100:
            logger.info(f"   {key}: {type(value).__name__} with {len(value)} items")
        else:
            logger.info(f"   {key}: {value}")
    
    return final_state 

if __name__ == "__main__":
    import asyncio
    import json
    import sys
    # --- Clear old tasks before running the graph ---
    for table in ["research_tasks", "content_tasks", "visual_tasks", "voice_tasks"]:
        with memory_table(table) as db:
            db.clear()
    logger.info("🎬 Starting demo execution...")
    # Accept user_query and learning_goal from command line if provided
    if len(sys.argv) >= 3:
        user_query = sys.argv[1]
        learning_goal = sys.argv[2]
    else:
        user_query = "how deep neural networks work"
        learning_goal = "the fundamentals of deep neural networks"
    final_state = asyncio.run(run_demo(
        user_query, 
        learning_goal
    ))
    logger.info("🎉 Demo completed successfully!")
    logger.info("📋 Final state keys: " + ", ".join(final_state.keys()))

    def pretty_print_section(title, data):
        if not data:
            return
        print(f"\n=== {title} ===")
        if isinstance(data, (dict, list)):
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(data)

    pretty_print_section("Research Tasks", final_state.get("research_tasks"))
    pretty_print_section("Research Outputs", final_state.get("research_outputs"))
    pretty_print_section("Content Outputs", final_state.get("content_outputs"))
    pretty_print_section("Visual Outputs", final_state.get("visual_outputs"))
    pretty_print_section("Voice Outputs", final_state.get("voice_outputs"))
    pretty_print_section("Sources", final_state.get("sources"))
    pretty_print_section("Curriculum Outline", final_state.get("curriculum_outline"))
    pretty_print_section("Slide Contents", final_state.get("slide_contents"))
    pretty_print_section("Deck JSON", final_state.get("deck_json"))
    pretty_print_section("Speaker Notes", final_state.get("speaker_notes"))
    pretty_print_section("Audio URLs", final_state.get("audio_urls"))
