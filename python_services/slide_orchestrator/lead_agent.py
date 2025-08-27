"""Enhanced LeadTeachingAgent with true agentic coordination (Phase 2.2)."""

from __future__ import annotations

import uuid
import logging
from typing import List, Optional, Dict, Any

import json
from .agent_base import AgentBase
from .shared_memory import memory_table
from .research_agent import ResearchAgent
from .content_agent import ContentDraftingAgent
from .visual_designer_agent import VisualDesignerAgent

import asyncio
import subprocess
import sys
import re

from .state import TeachingAgentState
from .tools import get_tool_registry, ToolCall
import os
from shared.llm_client import get_llm_client
from shared.config import get_settings
from shared.models import ConversationMessage, MessageRole, LLMProvider
from .planner_prompts import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)


class LeadTeachingAgent(AgentBase):
    """
    True agentic coordinator that intelligently orchestrates the multi-agent workflow.
    This agent makes dynamic decisions about when and how to deploy other agents.
    """

    def __init__(self) -> None:
        super().__init__("lead")
        logger.info("🎯 Enhanced LeadTeachingAgent initialized with true agentic coordination")

    async def __call__(self, state: TeachingAgentState) -> TeachingAgentState:
        """
        Analyzes the current state and makes intelligent decisions about agent deployment.
        This is the true "brain" of the system.
        """
        logger.info(f"🧠 Lead Agent is making intelligent decisions. Current phase: {state.get('current_phase')}")
        llm_client = get_llm_client()
        settings = get_settings()

        # Step 1: Analyze current state and agent outputs
        state_analysis = await self._analyze_current_state(state)
        logger.info(f"📊 State Analysis: {state_analysis}")

        # Step 2: Make intelligent planning decision
        # Force OpenAI GPT-5 for Lead agent planning, no Anthropic fallback.
        try:
            planning_decision = await self._make_planning_decision_gpt5(state, state_analysis, llm_client)
        except Exception:
            logger.exception("GPT-5 planning failed; using deterministic planner")
            planning_decision = await self._make_planning_decision(state, state_analysis, llm_client, settings)
        logger.info(f"🎯 Planning Decision: {planning_decision}")

        # Step 3: Create specific tasks for the next phase
        if planning_decision['next_phase'] != 'complete':
            await self._create_specific_tasks(state, planning_decision)
            logger.info(f"📝 Created specific tasks for {planning_decision['next_phase']} phase")

        # Step 4: Update state with new plan and increment iteration count
        state["current_phase"] = planning_decision['next_phase']
        state["current_objective"] = planning_decision['objective']
        state["planning_metadata"] = planning_decision.get('metadata', {})
        
        # CRITICAL: Increment iteration count to prevent infinite loops
        current_iteration = state.get("iteration_count", 0)
        state["iteration_count"] = current_iteration + 1
        logger.info(f"🔄 Iteration count incremented to: {state['iteration_count']}")

        # If we already have a final deck, prefer moving to 'complete' to end cleanly
        try:
            if state.get("final_deck") and state.get("current_phase") not in ("complete",):
                logger.info("✅ Final deck exists. Overriding phase to 'complete' for a seamless finish.")
                state["current_phase"] = "complete"
        except Exception:
            pass

        # Optional: Supervisor tool-calling to make contextual, per-slide decisions
        # Controlled via env SLIDES_PLANNER=supervisor (non-blocking, best-effort)
        try:
            if os.getenv("SLIDES_PLANNER", "legacy").lower() == "supervisor":
                await self._supervisor_opportunistic_tools(state)
        except Exception:
            logger.exception("Supervisor tool-calling encountered an error; continuing")

        # NEW: Publish planner phase to shared memory for streaming
        try:
            from datetime import datetime
            from .shared_memory import append_event  # type: ignore
            with memory_table("system_state") as db:  # type: ignore[name-defined]
                phase_payload = {
                    "phase": state["current_phase"],
                    "iteration": state["iteration_count"],
                    "objective": state["current_objective"],
                    "metadata": state.get("planning_metadata", {}),
                    "timestamp": datetime.utcnow().isoformat(),
                }
                db["phase"] = phase_payload
            append_event({
                "type": "planner_phase",
                "payload": phase_payload,
            })
        except Exception as e:
            logger.warning(f"Failed to publish planner phase to system_state: {e}")

        return state

    async def _supervisor_opportunistic_tools(self, state: TeachingAgentState) -> None:
        """Lightweight, contextual tool-calling without hardcoded flags.

        Heuristics (can be replaced with LLM function-calling later):
        - For any slide without visuals, consider a diagram when the title/subtitle suggests
          a process/structure/relationship; otherwise skip.
        - For any slide with speaker_notes and no audio, request voice synthesis.
        """
        registry = get_tool_registry()

        # Inspect current slides from content memory
        slides: List[Dict[str, Any]] = []
        with memory_table("content_tasks") as cdb:
            for rec in cdb.values():
                slides.extend(rec.get("slides", []) or [])

        if not slides:
            return

        # Simple semantic cues for when to prefer a diagram
        diagram_cues = ("how ", "process", "architecture", "flow", "pipeline", "relationship", "compare", "vs ")

        for s in slides:
            slide_number = s.get("slide_number")
            if not isinstance(slide_number, int):
                continue

            title = (s.get("title") or "").lower()
            subtitle = (s.get("subtitle") or "").lower()
            contents = s.get("contents") or []

            # Visual decision: if no contents yet and cues suggest structure → diagram
            if not contents and any(cue in title or cue in subtitle for cue in diagram_cues):
                await registry.call(ToolCall(name="visuals.generate_diagram", args={
                    "learning_goal": state.get("learning_goal", ""),
                    "slide_number": slide_number,
                    "objective": f"Create an educational diagram to illustrate: {s.get('title') or 'this concept'}",
                }))

            # Voice decision: synthesize if speaker_notes present and no audio yet
            if s.get("speaker_notes") and not s.get("audio_url"):
                await registry.call(ToolCall(name="voice.synthesize", args={
                    "slide_number": slide_number,
                    # speaker_notes can be inferred by the tool if not passed
                }))

    async def _analyze_current_state(self, state: TeachingAgentState) -> Dict[str, Any]:
        """Analyze the current state and agent outputs to understand what's been accomplished."""
        
        analysis = {
            "research_quality": "none",
            "content_quality": "none", 
            "visual_quality": "none",
            "voice_quality": "none",
            "missing_components": [],
            "ready_for_next_phase": False
        }

        # Analyze research outputs
        research_outputs = state.get("research_outputs", [])
        if research_outputs:
            research_task = research_outputs[0] if research_outputs else {}
            sources_count = len(research_task.get("sources", []))
            content_quality = research_task.get("content_quality", "unknown")
            research_method = research_task.get("research_method", "unknown")
            
            # CRITICAL FIX: Accept basic research quality and move forward
            if research_method == "fallback_synthesis" or content_quality == "basic":
                analysis["research_quality"] = "basic"  # Accept basic research
            elif sources_count > 2 and content_quality == "comprehensive":
                analysis["research_quality"] = "good"
            else:
                analysis["research_quality"] = "basic"  # Accept any research data
        else:
            analysis["missing_components"].append("research")

        # Analyze content outputs  
        content_outputs = state.get("content_outputs", [])
        if content_outputs:
            content_task = content_outputs[0] if content_outputs else {}
            slides_count = len(content_task.get("slides", []))
            # CRITICAL FIX: Accept any content with slides
            analysis["content_quality"] = "good" if slides_count > 0 else "poor"
        else:
            analysis["missing_components"].append("content")

        # Analyze visuals/voice from state and from current slides in shared memory for ground truth
        try:
            slides: list[dict] = []
            with memory_table("content_tasks") as cdb:  # type: ignore[name-defined]
                for rec in cdb.values():
                    slides.extend(rec.get("slides", []) or [])
        except Exception:
            slides = []

        # Visuals
        state_visual_assets = sum(len(t.get("visual_assets", []) or []) for t in state.get("visual_outputs", []) or [])
        slide_visual_assets = 0
        for s in slides:
            for c in s.get("contents", []) or []:
                if c.get("image_url") or c.get("mermaid_code") or c.get("asset_type") in ("mermaid_diagram", "conceptual_diagram", "educational_image"):
                    slide_visual_assets += 1
        total_visuals = state_visual_assets + slide_visual_assets
        if total_visuals > 0:
            analysis["visual_quality"] = "good"
        else:
            analysis["missing_components"].append("visuals")

        # Voice
        state_voice = len([v for v in (state.get("voice_outputs") or []) if v.get("audio_url")])
        slide_voice = len([s for s in slides if s.get("audio_url")])
        total_voice = state_voice + slide_voice
        if total_voice > 0:
            analysis["voice_quality"] = "good"
        else:
            analysis["missing_components"].append("voice")

        return analysis

    async def _make_planning_decision(self, state: TeachingAgentState, analysis: Dict[str, Any], llm_client, settings) -> Dict[str, Any]:
        """Make intelligent decision about what to do next based on current state analysis."""
        
        # CRITICAL SAFETY: Check for stuck phases
        current_phase = state.get("current_phase", "start")
        iteration_count = state.get("iteration_count", 0)
        
        # If we've been in the same phase for too many iterations, force progression
        if iteration_count >= 2 and current_phase in ["research", "content", "visual", "voice"]:  # Reduced from 3 to 2
            logger.warning(f"⚠️ Stuck in {current_phase} phase for {iteration_count} iterations. Forcing progression.")
            return self._force_phase_progression(current_phase)
        
        # SIMPLIFIED: Use deterministic logic instead of LLM calls for better performance
        if current_phase == "start":
            return {
                "next_phase": "research",
                "objective": f"Conduct comprehensive research on {state['learning_goal']} focusing on foundational concepts and current best practices.",
                "metadata": {
                    "reasoning": "Initial research phase required",
                    "quality_threshold": "comprehensive"
                }
            }
        
        # Simple phase progression logic with per-slide interleaving intent
        if current_phase == "research":
            # CRITICAL FIX: Accept basic research quality and move forward
            if analysis["research_quality"] in ["good", "basic"]:
                return {
                    "next_phase": "content",
                    "objective": f"Create engaging educational content based on research findings for {state['learning_goal']}",
                    "metadata": {
                        "reasoning": "Research complete (basic or good), moving to content creation",
                        "quality_threshold": "basic"
                    }
                }
            else:
                return {
                    "next_phase": "research",
                    "objective": f"Improve research quality for {state['learning_goal']} with more detailed analysis",
                    "metadata": {
                        "reasoning": "Research quality needs improvement",
                        "quality_threshold": "comprehensive"
                    }
                }
        
        elif current_phase == "content":
            # Interleave: once slides start appearing, move to visual/voice even if content isn't fully done
            return {
                "next_phase": "visual",
                "objective": f"Enhance slides with visuals for {state['learning_goal']} as they become available",
                "metadata": {
                    "reasoning": "Per-slide pipeline: visuals while content continues",
                    "quality_threshold": "basic"
                }
            }
        
        elif current_phase == "visual":
            # Interleave to voice to complete per-slide while visuals continue
            return {
                "next_phase": "voice",
                "objective": f"Generate voice narration for available slides about {state['learning_goal']}",
                "metadata": {
                    "reasoning": "Per-slide pipeline: voice while visuals/content continue",
                    "quality_threshold": "basic"
                }
            }
        
        elif current_phase == "voice":
            # Loop back to content to let more slides be produced; planner will keep cycling
            return {
                "next_phase": "content",
                "objective": f"Continue generating slide content while previous slides are enhanced",
                "metadata": {
                    "reasoning": "Per-slide interleaving loop",
                    "quality_threshold": "basic"
                }
            }
        
        elif current_phase == "assembly":
            return {
                "next_phase": "complete",
                "objective": f"Finalize presentation for {state['learning_goal']}",
                "metadata": {
                    "reasoning": "Assembly complete, all phases done",
                    "quality_threshold": "comprehensive"
                }
            }
        
        # Fallback
        return {
            "next_phase": "complete",
            "objective": f"Complete presentation for {state['learning_goal']}",
            "metadata": {
                "reasoning": "Fallback completion",
                "quality_threshold": "comprehensive"
            }
        }

    async def _make_planning_decision_gpt5(self, state: TeachingAgentState, analysis: Dict[str, Any], llm_client) -> Dict[str, Any]:
        """Use OpenAI GPT-5 Responses API for the Lead agent (no cross-provider fallback)."""
        # Summarize minimal state for the planner
        summary = {
            "phase": state.get("current_phase"),
            "iteration": state.get("iteration_count", 0),
            "learning_goal": state.get("learning_goal"),
            "content_slides": sum(len(t.get("slides", []) or []) for t in state.get("content_outputs", [])),
            "pending_content_tasks": 0,
            "visual_assets": sum(len(t.get("visual_assets", []) or []) for t in state.get("visual_outputs", [])),
            "voice_ready": len(state.get("voice_outputs", [])),
            "analysis": analysis,
        }
        import json as _json
        system = ConversationMessage(role=MessageRole.SYSTEM, content=SYSTEM_PROMPT)
        user = ConversationMessage(role=MessageRole.USER, content=build_user_prompt(_json.dumps(summary), has_existing_plan=bool(state.get("planning_metadata", {}).get("plan"))))
        # Require OpenAI path; force GPT-5 model and disable fallback to other providers
        model = os.getenv("LEAD_AGENT_MODEL", "gpt-5-2025-08-07")
        try:
            text, provider_used = await llm_client.generate_response(
                [system, user],
                preferred_provider=LLMProvider.OPENAI,
                max_tokens=1200,
                temperature=0.3,
                model=model,
                allow_fallback=False,
            )
        except Exception:
            # Do not attempt Anthropic; directly fall back to deterministic planning
            logger.exception("GPT-5 planning error; falling back to deterministic planner")
            return await self._make_planning_decision(state, analysis, llm_client, get_settings())

        # Parse JSON safely
        plan_obj = None
        next_phase = state.get("current_phase", "content")
        objective = f"Continue towards the best slides about {state.get('learning_goal')}"
        metadata = {"reasoning": "gpt5"}
        actions = []
        # Extract JSON from potential code fences
        fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if fenced_match:
            text = fenced_match.group(1).strip()
        try:
            data = _json.loads(text)
            plan_obj = data.get("plan")
            next_phase = data.get("next_phase", next_phase)
            objective = data.get("objective", objective)
            metadata = data.get("metadata", metadata)
            actions = data.get("actions", [])
        except Exception:
            logger.warning("Planner returned non-JSON; using deterministic fallback for fields")

        # Guard: don't re-enter research if we already have acceptable research
        if next_phase == "research" and (analysis.get("research_quality") in ("good", "basic") or state.get("research_outputs")):
            metadata = {**metadata, "reasoning": "Skip repeat research; moving to content"}
            next_phase = "content"

        # Store plan in memory_state for persistence
        with memory_table("system_state") as db:
            db["planner_plan"] = plan_obj or db.get("planner_plan") or {"steps": []}

        # Execute tool actions opportunistically
        try:
            registry = get_tool_registry()
            for act in actions:
                tool_name = (act or {}).get("tool")
                args = (act or {}).get("args") or {}
                if tool_name and registry.has(tool_name):
                    await registry.call(ToolCall(name=tool_name, args=args))
        except Exception:
            logger.exception("Error executing planner tool actions")

        return {
            "next_phase": next_phase,
            "objective": objective,
            "metadata": {**metadata, "planner": "gpt5"},
        }

    # Anthropic-based planning has been removed per requirement to avoid fallback to Anthropic for Lead agent.

    def _fallback_planning_decision(self, state: TeachingAgentState, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback planning when LLM fails."""
        missing = analysis.get('missing_components', [])
        
        if 'research' in missing:
            return {
                "next_phase": "research",
                "objective": f"Conduct research on {state['learning_goal']}",
                "metadata": {"reasoning": "Research missing", "quality_threshold": "basic"}
            }
        elif 'content' in missing:
            return {
                "next_phase": "content", 
                "objective": f"Create slide content for {state['learning_goal']}",
                "metadata": {"reasoning": "Content missing", "quality_threshold": "basic"}
            }
        elif 'visuals' in missing:
            return {
                "next_phase": "visual",
                "objective": f"Create visual assets for slides",
                "metadata": {"reasoning": "Visuals missing", "quality_threshold": "basic"}
            }
        elif 'voice' in missing:
            return {
                "next_phase": "voice",
                "objective": f"Generate voice narration for slides",
                "metadata": {"reasoning": "Voice missing", "quality_threshold": "basic"}
            }
        else:
            return {
                "next_phase": "assembly",
                "objective": "Assemble final slide deck",
                "metadata": {"reasoning": "All components ready", "quality_threshold": "complete"}
            }

    async def _create_specific_tasks(self, state: TeachingAgentState, planning_decision: Dict[str, Any]) -> None:
        """Create specific, detailed tasks for the next phase based on intelligent planning."""
        
        next_phase = planning_decision['next_phase']
        objective = planning_decision['objective']
        metadata = planning_decision.get('metadata', {})
        
        task_id = str(uuid.uuid4())
        specific_requirements = metadata.get('specific_requirements', '')
        
        # Create detailed task based on phase
        if next_phase == "research":
            task = {
                "id": task_id,
                "status": "pending",
                "objective": objective,
                "learning_goal": state['learning_goal'],
                "specific_requirements": specific_requirements,
                "quality_threshold": metadata.get('quality_threshold', 'comprehensive'),
                "research_focus_areas": self._extract_research_focus(objective),
                "created_at": asyncio.get_event_loop().time()
            }
            with memory_table("research_tasks") as db:
                db[task_id] = task
                
        elif next_phase == "content":
            task = {
                "id": task_id,
                "status": "pending", 
                "objective": objective,
                "learning_goal": state['learning_goal'],
                "specific_requirements": specific_requirements,
                "quality_threshold": metadata.get('quality_threshold', 'comprehensive'),
                "slide_structure": self._extract_slide_structure(objective),
                "difficulty_level": self._extract_difficulty_level(objective),
                "created_at": asyncio.get_event_loop().time()
            }
            with memory_table("content_tasks") as db:
                db[task_id] = task
                
        elif next_phase == "visual":
            task = {
                "id": task_id,
                "status": "pending",
                "objective": objective,
                "learning_goal": state['learning_goal'], 
                "specific_requirements": specific_requirements,
                "quality_threshold": metadata.get('quality_threshold', 'comprehensive'),
                "visual_types": self._extract_visual_types(objective),
                "created_at": asyncio.get_event_loop().time()
            }
            with memory_table("visual_tasks") as db:
                db[task_id] = task
                
        elif next_phase == "voice":
            task = {
                "id": task_id,
                "status": "pending",
                "objective": objective,
                "learning_goal": state['learning_goal'],
                "specific_requirements": specific_requirements,
                "voice_style": self._extract_voice_style(objective),
                "created_at": asyncio.get_event_loop().time()
            }
            with memory_table("voice_tasks") as db:
                db[task_id] = task

        logger.info(f"📋 Created detailed task for {next_phase}: {task_id}")

    def _extract_research_focus(self, objective: str) -> List[str]:
        """Extract research focus areas from objective."""
        # Simple keyword extraction - could be enhanced with NLP
        focus_areas = []
        if "foundational" in objective.lower():
            focus_areas.append("foundational_concepts")
        if "best practices" in objective.lower():
            focus_areas.append("best_practices")
        if "authoritative" in objective.lower():
            focus_areas.append("authoritative_sources")
        return focus_areas or ["comprehensive_research"]

    def _extract_slide_structure(self, objective: str) -> str:
        """Extract slide structure requirements from objective."""
        if "comprehensive" in objective.lower():
            return "detailed_with_examples"
        elif "overview" in objective.lower():
            return "high_level_summary"
        else:
            return "balanced_coverage"

    def _extract_difficulty_level(self, objective: str) -> str:
        """Extract difficulty level from objective."""
        if "advanced" in objective.lower():
            return "advanced"
        elif "beginner" in objective.lower():
            return "beginner"
        else:
            return "intermediate"

    def _extract_visual_types(self, objective: str) -> List[str]:
        """Extract visual types needed from objective."""
        visual_types = []
        if "diagram" in objective.lower():
            visual_types.append("diagrams")
        if "image" in objective.lower():
            visual_types.append("images")
        if "chart" in objective.lower():
            visual_types.append("charts")
        return visual_types or ["educational_images", "diagrams"]

    def _extract_voice_style(self, objective: str) -> str:
        """Extract voice style from objective."""
        if "enthusiastic" in objective.lower():
            return "enthusiastic"
        elif "professional" in objective.lower():
            return "professional"
        else:
            return "friendly"

    def _force_phase_progression(self, current_phase: str) -> Dict[str, Any]:
        """Force progression to the next phase when stuck."""
        phase_sequence = ["research", "content", "visual", "voice", "assembly", "complete"]
        
        try:
            current_index = phase_sequence.index(current_phase)
            next_phase = phase_sequence[current_index + 1] if current_index + 1 < len(phase_sequence) else "complete"
        except ValueError:
            next_phase = "complete"
        
        logger.info(f"🔄 Forcing progression from {current_phase} to {next_phase}")
        
        return {
            "next_phase": next_phase,
            "objective": f"Forced progression from {current_phase} to {next_phase} due to iteration limit",
            "metadata": {
                "reasoning": f"Stuck in {current_phase} phase, forcing progression",
                "quality_threshold": "basic",
                "forced_progression": True
            }
        }

    async def run(self) -> None:
        """No-op run method to satisfy abstract base class."""
        pass 