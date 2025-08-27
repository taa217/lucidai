"""Enhanced ContentDraftingAgent with LLM integration for real slide generation (Phase 4.1)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import re
from typing import Dict, List, Any, Optional
from datetime import datetime

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from shared.config import get_settings
from shared.llm_client import get_llm_client
from shared.models import (
    ConversationMessage, MessageRole, SlideType, SlideLayout, 
    SlideContent, Slide, SourceReference, LLMProvider
)

from .agent_base import AgentBase
from .shared_memory import memory_table

logger = logging.getLogger(__name__)


class ContentDraftingAgent(AgentBase):
    """
    Advanced content drafting agent that converts research into educational slide content.

    Args:
        agent_id (str): Unique agent identifier.
        preferred_provider (LLMProvider|str): Which LLM to use for curriculum and slide generation. Default: Anthropic.
            - To use OpenAI: LLMProvider.OPENAI or 'openai'
            - To use Perplexity: LLMProvider.PERPLEXITY or 'perplexity'
            - To use Anthropic: LLMProvider.ANTHROPIC or 'anthropic'
    """
    def __init__(self, agent_id: str = "main", preferred_provider: str = None) -> None:
        super().__init__(f"content-{agent_id}")
        self.agent_id = agent_id
        self.llm_client = get_llm_client()
        # Default to Anthropic if not specified
        if preferred_provider is None:
            preferred_provider = LLMProvider.ANTHROPIC
        self.preferred_provider = preferred_provider

    # --- Lesson Memory Helpers -------------------------------------------------
    def _get_lesson_memory(self) -> Dict[str, Any]:
        try:
            with memory_table("lesson_memory") as db:
                return dict(db.get("memory", {}))
        except Exception:
            return {}

    def _update_lesson_memory(self, **kwargs: Any) -> None:
        try:
            with memory_table("lesson_memory") as db:
                mem = dict(db.get("memory", {}))
                mem.update(kwargs)
                db["memory"] = mem
        except Exception:
            pass

    def _compute_ready_for_playback(self, slide: Dict[str, Any]) -> bool:
        title = (slide.get("title") or "").strip()
        contents_ok = bool(slide.get("contents"))
        notes = (slide.get("speaker_notes") or "").strip()
        not_placeholder = title.lower() not in ("content slide", "slide")
        long_enough_notes = len(notes.split()) >= 8 and len(notes) >= 40
        return bool(title and not_placeholder and contents_ok and long_enough_notes)

    async def _append_slide_to_task(self, task_id: str, slide: Dict[str, Any]) -> None:
        """Append a single slide to the task in shared memory immediately."""
        with memory_table("content_tasks") as db:
            task_rec = db.get(task_id, {})
            slides = list(task_rec.get("slides", []))
            # Bump version to signal downstream streamers
            new_slide = dict(slide)
            try:
                current_version = int(new_slide.get("version", 0))
            except Exception:
                current_version = 0
            new_slide["version"] = current_version + 1
            slides.append(new_slide)
            task_rec["slides"] = slides
            # Keep task as in_progress until finalization
            if task_rec.get("status") not in ("in_progress", "done"):
                task_rec["status"] = "in_progress"
            db[task_id] = task_rec

    async def _generate_and_stream_slides(
        self,
        task_id: str,
        curriculum: Dict[str, Any],
        research_sources: List[Dict[str, Any]],
        learning_goal: str,
    ) -> List[Dict[str, Any]]:
        """Generate slides one-by-one, persisting each immediately for streaming."""
        slides: List[Dict[str, Any]] = []
        # Title
        title_slide = await self._create_title_slide(curriculum, 1)
        slides.append(title_slide)
        await self._append_slide_to_task(task_id, title_slide)
        try:
            from .shared_memory import append_event  # type: ignore
            append_event({
                "type": "slide_created",
                "payload": {"slide": title_slide}
            })
        except Exception:
            pass

        slide_number = 2
        for topic in curriculum.get("topics", []):
            topic = dict(topic)
            topic["slides_needed"] = 1  # fast path
            try:
                topic_slides = await self._generate_topic_slides(
                    topic, research_sources, learning_goal, slide_number
                )
            except Exception:
                topic_slides = [self._create_fallback_slide(topic, slide_number)]
            for s in topic_slides:
                slides.append(s)
                await self._append_slide_to_task(task_id, s)
                try:
                    from .shared_memory import append_event  # type: ignore
                    append_event({
                        "type": "slide_created",
                        "payload": {"slide": s}
                    })
                except Exception:
                    pass
                slide_number += 1

        # Append summary at end to keep per-slide pipeline focused
        summary_slide = await self._create_summary_slide(curriculum, slide_number)
        slides.append(summary_slide)
        await self._append_slide_to_task(task_id, summary_slide)
        try:
            from .shared_memory import append_event  # type: ignore
            append_event({
                "type": "slide_created",
                "payload": {"slide": summary_slide}
            })
        except Exception:
            pass
        return slides

    @AgentBase.retryable  # type: ignore[misc]
    async def _perform_content_drafting(self, task_id: str, task: Dict[str, Any]) -> None:
        """Generate actual slide content using LLM integration."""
        objective = task.get("objective", "")
        learning_goal = task.get("learning_goal", "")
        
        logger.info(f"📝 Starting content drafting for: {objective}")
        
        try:
            # Get research results from shared memory
            research_sources = await self._get_research_results()
            logger.info(f"📚 Retrieved {len(research_sources)} research sources for content drafting.")
            
            # CRITICAL FIX: If no research data, create basic curriculum
            if not research_sources:
                logger.warning("⚠️ No research data available, creating basic curriculum")
                curriculum = self._create_fallback_curriculum(learning_goal)
            else:
                # Generate curriculum outline with timeout
                logger.info("⏳ Generating curriculum outline (timeout: 90s)...")
                try:
                    # Increased timeout to 90 seconds for extended thinking LLM calls
                    curriculum = await asyncio.wait_for(
                        self._generate_curriculum_outline(learning_goal, research_sources),
                        timeout=90
                    )
                    logger.info(f"📋 Curriculum outline generated: {curriculum}")
                except asyncio.TimeoutError:
                    logger.error("❌ Curriculum generation timed out after 90 seconds!")
                    logger.info("🔄 Using fallback curriculum...")
                    curriculum = self._create_fallback_curriculum(learning_goal)

            # Persist/update lesson memory with curriculum outline
            try:
                self._update_lesson_memory(
                    learning_goal=learning_goal,
                    curriculum_title=curriculum.get("title"),
                    learning_objectives=curriculum.get("learning_objectives"),
                    topics=[t.get("title") for t in curriculum.get("topics", [])],
                    phase="content",
                )
            except Exception:
                pass

            # Generate slides and stream per-slide to shared memory
            logger.info("⏳ Generating slides with streaming...")
            try:
                # No hard timeout here; per-slide calls have their own timeouts
                slides = await self._generate_and_stream_slides(
                    task_id, curriculum, research_sources, learning_goal
                )
            except Exception as e:
                logger.error(f"❌ Slide streaming generation failed: {e}")
                slides = self._create_fallback_slides(curriculum, learning_goal)
                # Persist fallback slides quickly
                for s in slides:
                    await self._append_slide_to_task(task_id, s)
            
            # Update lesson memory with slide titles
            try:
                self._update_lesson_memory(
                    slide_titles=[s.get("title") for s in (slides or [])],
                    total_slides=len(slides or []),
                )
            except Exception:
                pass

            # Store results in shared memory IMMEDIATELY to prevent timeout issues
            logger.info("💾 Storing slides in shared memory...")
            with memory_table("content_tasks") as db:
                # Preserve slides that were appended progressively
                existing = db.get(task_id, {})
                existing_slides = existing.get("slides", slides)
                db[task_id] = {
                    **task,
                    "status": "done",
                    "completed_at": datetime.utcnow().isoformat(),
                    "curriculum_outline": curriculum,
                    "total_slides_generated": len(existing_slides),
                    "slides": existing_slides,
                }
                logger.info(f"✅ Content task {task_id} marked as done and stored in shared memory.")
            
            logger.info(f"✅ Content drafting completed: {len(slides)} slides generated")
            
        except Exception as e:
            logger.error(f"❌ Content drafting failed for task {task_id}: {str(e)}")
            # CRITICAL FIX: Create basic fallback slides instead of failing
            try:
                logger.info("🔄 Creating fallback slides due to content generation failure...")
                fallback_curriculum = self._create_fallback_curriculum(learning_goal)
                fallback_slides = self._create_fallback_slides(fallback_curriculum, learning_goal)
                
                with memory_table("content_tasks") as db:
                    db[task_id] = {
                        **task,
                        "status": "done",
                        "completed_at": datetime.utcnow().isoformat(),
                        "curriculum_outline": fallback_curriculum,
                        "total_slides_generated": len(fallback_slides),
                        "slides": fallback_slides,
                        "error": f"Original content generation failed: {str(e)}, used fallback"
                    }
                logger.info(f"✅ Fallback content completed: {len(fallback_slides)} slides generated")
            except Exception as fallback_error:
                logger.error(f"❌ Even fallback content failed: {fallback_error}")
                with memory_table("content_tasks") as db:
                    db[task_id] = {
                        **task,
                        "status": "failed",
                        "error": f"Both original and fallback content failed: {str(e)}, {str(fallback_error)}",
                        "completed_at": datetime.utcnow().isoformat(),
                        "result": []
                    }
                raise

    async def _get_research_results(self) -> List[Dict[str, Any]]:
        """Retrieve completed research results from shared memory."""
        research_summaries = []
        with memory_table("research_tasks") as db:
            for task_id, task_data in db.items():
                # Check for 'done' status AND the correct 'research_summary' key
                if task_data.get("status") == "done" and "research_summary" in task_data:
                    # Create a structured source from the research summary
                    summary_data = {
                        "title": task_data.get("objective", "Research Summary"),
                        "snippet": task_data.get("research_summary"),
                        "subtask_results": task_data.get("subtask_results", [])
                    }
                    research_summaries.append(summary_data)

        logger.info(f"📚 Retrieved {len(research_summaries)} research summaries.")
        return research_summaries

    async def _generate_curriculum_outline(self, learning_goal: str, sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate a pedagogical curriculum outline for the learning goal."""
        
        # Prepare sources summary for context
        logger.info(f"[CURRICULUM] Number of sources: {len(sources)}")
        sources_summary = "\n".join([
            f"- {source.get('title', 'Unknown')}: {source.get('snippet', 'No description')}"
            for source in sources[:10]  # Limit to top 10 sources
        ])
        
        curriculum_prompt = f"""
You are an expert instructional designer. Create a comprehensive curriculum outline for teaching: "{learning_goal}"

Available Research Sources:
{sources_summary}

IMPORTANT: You must provide COMPLETE, VALID JSON. Do not cut off mid-response.

Generate a curriculum that:
1. Starts with fundamentals and builds complexity gradually
2. Includes practical examples and applications
3. Follows proven pedagogical principles
4. Is suitable for a 15-20 slide presentation
5. Ensures each concept builds on previous ones

Structure your response as COMPLETE JSON:
{{
    "title": "Course Title",
    "description": "Brief description of what will be taught",
    "learning_objectives": ["objective 1", "objective 2", ...],
    "topics": [
        {{
            "title": "Topic Title",
            "description": "What this topic covers",
            "slides_needed": 2,
            "key_concepts": ["concept1", "concept2"],
            "difficulty_level": "beginner|intermediate|advanced"
        }}
    ],
    "estimated_duration_minutes": 20
}}

Ensure the JSON is complete and properly closed with all brackets.
"""
        logger.info(f"[CURRICULUM] Prompt length: {len(curriculum_prompt)}")
        try:
            messages = [
                ConversationMessage(role=MessageRole.SYSTEM, content="You are an expert instructional designer and curriculum developer."),
                ConversationMessage(role=MessageRole.USER, content=curriculum_prompt)
            ]
            logger.info(f"[CURRICULUM] Using provider: {self.preferred_provider}")
            try:
                # Increased LLM call timeout to 120 seconds for extended thinking
                response, provider = await asyncio.wait_for(
                    self.llm_client.generate_response(
                        messages,
                        preferred_provider=self.preferred_provider,
                        max_tokens=1800,
                        temperature=0.3
                    ),
                    timeout=120
                )
                logger.info(f"[CURRICULUM] LLM call returned. Provider: {provider}")
            except asyncio.TimeoutError:
                logger.error("❌ Curriculum generation timed out after 120 seconds!")
                print("[CURRICULUM] LLM call timed out after 120 seconds!")
                raise Exception("Curriculum generation timed out")
            # Extract JSON from response with improved parsing
            logger.info(f"📝 Raw curriculum response: {response[:300]}...")
            
            # Try multiple JSON extraction strategies
            json_str = None
            
            # Strategy 1: Look for JSON between ```json and ``` markers
            json_match = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', response)
            if json_match:
                json_str = json_match.group(1)
                logger.info("✅ Found JSON in code block")
            
            # Strategy 2: Look for JSON object with more flexible regex
            if not json_str:
                json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response)
                if json_match:
                    json_str = json_match.group(0)
                    logger.info("✅ Found JSON with flexible regex")
            
            # Strategy 3: Simple start/end brace approach
            if not json_str:
                start_idx = response.find("{")
                end_idx = response.rfind("}") + 1
                if start_idx >= 0 and end_idx > start_idx:
                    json_str = response[start_idx:end_idx]
                    logger.info("✅ Found JSON with start/end braces")
            
            if json_str:
                try:
                    # Clean up common JSON issues
                    json_str = json_str.strip()
                    # Remove any trailing commas before closing braces
                    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
                    # Fix common quote issues
                    json_str = json_str.replace('"', '"').replace('"', '"')
                    json_str = json_str.replace(''', "'").replace(''', "'")
                    
                    curriculum = json.loads(json_str)
                    logger.info(f"📋 Generated curriculum with {len(curriculum.get('topics', []))} topics")
                    print(f"[CURRICULUM] Curriculum parsed successfully with {len(curriculum.get('topics', []))} topics")
                    return curriculum
                except json.JSONDecodeError as json_err:
                    logger.error(f"❌ Failed to parse curriculum JSON: {json_err}")
                    logger.error(f"❌ JSON string: {json_str}")
            
            # If we get here, use fallback
            logger.warning("[CURRICULUM] Using fallback curriculum due to JSON parsing failure")
            print("[CURRICULUM] Using fallback curriculum due to JSON parsing failure")
            return self._create_fallback_curriculum(learning_goal)
                
        except Exception as e:
            logger.error(f"[CURRICULUM] LLM call failed: {e}", exc_info=True)
            print(f"[CURRICULUM] LLM call failed: {e}")
            return self._create_fallback_curriculum(learning_goal)

    def _create_fallback_curriculum(self, learning_goal: str) -> Dict[str, Any]:
        """Create a basic curriculum structure as fallback."""
        return {
            "title": f"Introduction to {learning_goal}",
            "description": f"A comprehensive introduction to {learning_goal}",
            "learning_objectives": [
                f"Understand the fundamentals of {learning_goal}",
                f"Learn practical applications of {learning_goal}",
                f"Gain hands-on experience with {learning_goal}"
            ],
            "topics": [
                {
                    "title": "Introduction",
                    "description": f"What is {learning_goal}?",
                    "slides_needed": 2,
                    "key_concepts": ["definition", "importance"],
                    "difficulty_level": "beginner"
                },
                {
                    "title": "Core Concepts",
                    "description": f"Key principles of {learning_goal}",
                    "slides_needed": 3,
                    "key_concepts": ["principles", "components"],
                    "difficulty_level": "intermediate"
                },
                {
                    "title": "Applications",
                    "description": f"Real-world uses of {learning_goal}",
                    "slides_needed": 2,
                    "key_concepts": ["examples", "case studies"],
                    "difficulty_level": "intermediate"
                }
            ],
            "estimated_duration_minutes": 15
        }

    def _create_fallback_slides(self, curriculum: Dict[str, Any], learning_goal: str) -> List[Dict[str, Any]]:
        """Create basic fallback slides when main generation fails."""
        logger.info("🔄 Creating fallback slides...")
        
        slides = []
        slide_number = 1
        
        # Create title slide
        title_slide = {
            "slide_number": slide_number,
            "title": f"Introduction to {learning_goal}",
            "layout": "title",
            "contents": [
                {
                    "type": "text",
                    "value": f"Introduction to {learning_goal}",
                    "position": {"x": 50, "y": 40}
                },
                {
                    "type": "text", 
                    "value": "Educational Presentation",
                    "position": {"x": 50, "y": 60}
                }
            ],
            "speaker_notes": f"Welcome to our presentation on {learning_goal}. Today we'll explore the fundamental concepts and principles."
        }
        slides.append(title_slide)
        slide_number += 1
        
        # Create content slides from curriculum topics
        for topic in curriculum.get("topics", []):
            topic_title = topic.get("title", "Topic")
            topic_description = topic.get("description", "Topic description")
            
            content_slide = {
                "slide_number": slide_number,
                "title": topic_title,
                "layout": "bullet_points",
                "contents": [
                    {
                        "type": "text",
                        "value": topic_title,
                        "position": {"x": 50, "y": 20}
                    },
                    {
                        "type": "bullet_list",
                        "value": [
                            "Key concept 1",
                            "Key concept 2", 
                            "Key concept 3",
                            "Key concept 4"
                        ],
                        "position": {"x": 50, "y": 40}
                    }
                ],
                "speaker_notes": f"This slide covers {topic_title}. {topic_description}"
            }
            slides.append(content_slide)
            slide_number += 1
        
        # Create summary slide
        summary_slide = {
            "slide_number": slide_number,
            "title": "Summary and Key Takeaways",
            "layout": "bullet_points",
            "contents": [
                {
                    "type": "text",
                    "value": "Summary and Key Takeaways",
                    "position": {"x": 50, "y": 20}
                },
                {
                    "type": "bullet_list",
                    "value": [
                        "Understanding of fundamental principles",
                        "Key concepts and applications",
                        "Practical implications",
                        "Future considerations"
                    ],
                    "position": {"x": 50, "y": 40}
                }
            ],
            "speaker_notes": f"Let's summarize what we've learned about {learning_goal}. We've covered the fundamental principles, key concepts, and practical applications."
        }
        slides.append(summary_slide)
        
        logger.info(f"✅ Created {len(slides)} fallback slides")
        return slides

    async def _generate_slides(self, curriculum: Dict[str, Any], sources: List[Dict[str, Any]], learning_goal: str) -> List[Dict[str, Any]]:
        """Generate individual slides based on curriculum outline."""
        
        slides = []
        slide_number = 1
        
        # Create title slide
        title_slide = await self._create_title_slide(curriculum, slide_number)
        slides.append(title_slide)
        slide_number += 1
        
        # Generate content slides for each topic
        for topic in curriculum.get("topics", []):
            # Reduce slides_needed to 1 for fast testing
            topic = dict(topic)
            topic["slides_needed"] = 1
            topic_slides = await self._generate_topic_slides(
                topic, sources, learning_goal, slide_number
            )
            slides.extend(topic_slides)
            slide_number += len(topic_slides)
        
        # Create summary slide
        summary_slide = await self._create_summary_slide(curriculum, slide_number)
        slides.append(summary_slide)
        
        return slides

    async def _create_title_slide(self, curriculum: Dict[str, Any], slide_number: int) -> Dict[str, Any]:
        """Create the title slide for the presentation."""
        
        data = {
            "id": str(uuid.uuid4()),
            "slide_number": slide_number,
            "type": SlideType.TITLE.value,
            "layout": SlideLayout.FULL_TEXT.value,
            "title": curriculum.get("title", "Learning Presentation"),
            "contents": [
                {
                    "type": "text",
                    "value": curriculum.get("description", ""),
                    "position": {"x": 50, "y": 60},
                    "style": {"fontSize": 18, "textAlign": "center"}
                }
            ],
            "speaker_notes": f"Welcome to this presentation on {curriculum.get('title', 'our topic')}. {curriculum.get('description', '')} We'll cover the essential concepts step by step.",
            "duration_seconds": 20.0,
            "sources": []
        }
        data["renderCode"] = self._build_render_code()
        return data

    async def _generate_topic_slides(self, topic: Dict[str, Any], sources: List[Dict[str, Any]], learning_goal: str, start_slide_number: int) -> List[Dict[str, Any]]:
        """Generate slides for a specific topic."""
        
        slides_needed = topic.get("slides_needed", 2)
        topic_slides = []
        
        for i in range(slides_needed):
            memory_ctx = self._get_lesson_memory()
            persona_hint = (
                "You are a friendly, engaging classroom teacher. Address students directly with vivid examples and micro-questions, "
                "and avoid meta-instructions like 'in this slide' or 'I will explain'. Write speaker_notes as if speaking live in class, "
                "natural and conversational, 55–95 words."
            )

            slide_prompt = f"""
Create educational slide content.

Lesson memory context:
{json.dumps(memory_ctx) if 'json' in globals() else memory_ctx}

Topic: {topic.get('title', '')}
Description: {topic.get('description', '')}
Key Concepts: {', '.join(topic.get('key_concepts', []))}
Learning Goal: {learning_goal}
Slide {i+1} of {slides_needed} for this topic

Teaching persona: {persona_hint}

IMPORTANT:
- Return COMPLETE, VALID JSON with a top-level object.
- Include a field "render_code" containing PLAIN JSX (no TypeScript types) that will render the slide in a clean two‑column layout without overlaps, using React Native Web primitives. This code MUST be present and runnable.
- The code must be a self-contained module with: `export default function Slide({{ slide, showCaptions, isPlaying }}) {{ return ( ... ); }}`
- Do NOT include import statements. Assume these are in scope: React, View, Text, Image, Animated, StyleSheet, Dimensions, Platform, MermaidDiagram, utils.
- Use data only from `slide` to render text/bullets/images/diagrams.

Generate content that:
1. Is clear and progressive
2. Uses examples; prefer diagram layout when it helps
3. Includes 50–90 word speaker_notes in natural spoken voice (no meta prompts)

Respond in COMPLETE JSON (no code fences):
{{
  "title": "Slide Title",
  "layout": "bullet_points|full_text|diagram",
  "contents": [
    {{ "type": "text|bullet_list|diagram|image", "value": "text | [bullets] | diagram description or object | image object", "position": {{"x":50, "y":30}} }}
  ],
  "speaker_notes": "Your spoken explanation here...",
  "render_code": "export default function Slide({{ slide, showCaptions, isPlaying }}) {{\\n  return (\\n    <View />\\n  );\\n}}"
}}

If JSON string limits prevent embedding full code, also include the exact same code in a separate ```tsx block after the JSON.
"""

            try:
                messages = [
                    ConversationMessage(role=MessageRole.SYSTEM, content="You are an expert educator creating slide content."),
                    ConversationMessage(role=MessageRole.USER, content=slide_prompt)
                ]
                response, _ = await asyncio.wait_for(
                    self.llm_client.generate_response(
                        messages,
                        preferred_provider=self.preferred_provider,
                        max_tokens=1500,
                        temperature=0.4
                    ),
                    timeout=120  # Increased timeout to 120 seconds for robustness
                )
                
                # Parse slide content
                slide_data = self._parse_slide_response(response, topic_title=topic.get("title"))
                
                # Create structured slide
                slide = {
                    "id": str(uuid.uuid4()),
                    "slide_number": start_slide_number + i,
                    "type": SlideType.CONTENT.value,
                    "layout": slide_data.get("layout", SlideLayout.BULLET_POINTS.value),
                    "title": slide_data.get("title", f"{topic.get('title', '')}"),
                    "contents": slide_data.get("contents", []),
                    "speaker_notes": slide_data.get("speaker_notes", f"In this slide, we explore {topic.get('title', 'this topic')} in more detail."),
                    "duration_seconds": 30.0,
                    "sources": self._get_relevant_sources(sources, topic.get("key_concepts", []))
                }
                # If model provided render_code, use it; else attach template
                model_code = slide_data.get("render_code") if isinstance(slide_data, dict) else None
                # Normalize placeholders and ensure minimal completeness
                if (slide.get("title") or "").strip().lower() in ("content slide", "slide"):
                    slide["title"] = f"{topic.get('title', 'Topic')}"
                if not slide.get("contents"):
                    fallback_bullets = topic.get("key_concepts", ["Key concept 1", "Key concept 2"]) or ["Key concept 1", "Key concept 2"]
                    slide["contents"] = [{
                        "type": "bullet_list",
                        "value": fallback_bullets,
                        "position": {"x": 10, "y": 30}
                    }]
                # Re-apply positioning to avoid overlapping when model returned absolute positions
                slide["contents"] = self._apply_intelligent_positioning(slide.get("contents", []), slide.get("layout", "bullet_points"))
                
                # If the model omitted render_code or produced empty notes, run a quick refinement
                if not model_code or len((slide.get("speaker_notes") or "").strip().split()) < 12:
                    try:
                        refined = await self._refine_slide_with_llm(slide)
                        if refined.get("render_code"):
                            model_code = refined.get("render_code")
                        if refined.get("speaker_notes"):
                            slide["speaker_notes"] = refined["speaker_notes"]
                    except Exception:
                        pass

                slide["ready_for_playback"] = self._compute_ready_for_playback(slide)
                # Prefer model-provided code; fallback to template
                slide["renderCode"] = (model_code or self._build_render_code())
                topic_slides.append(slide)
                
            except asyncio.TimeoutError:
                logger.error(f"❌ Slide generation timed out after 120 seconds for topic {topic.get('title', '')} slide {i+1}!")
                print(f"❌ Slide generation timed out after 120 seconds for topic {topic.get('title', '')} slide {i+1}!")
                # Create fallback slide
                fallback_slide = self._create_fallback_slide(topic, start_slide_number + i)
                topic_slides.append(fallback_slide)
            except Exception as e:
                logger.warning(f"Failed to generate slide {i+1} for topic {topic.get('title', '')}: {e}")
                # Create fallback slide
                fallback_slide = self._create_fallback_slide(topic, start_slide_number + i)
                topic_slides.append(fallback_slide)
        
        return topic_slides

    def _parse_slide_response(self, response: str, *, topic_title: Optional[str] = None) -> Dict[str, Any]:
        """Parse LLM response into structured slide data."""
        logger.info(f"📝 Raw slide response: {response[:300]}...")
        
        # Try multiple JSON extraction strategies
        json_str = None
        
        # Strategy 1: Look for JSON between ```json and ``` markers
        json_match = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', response)
        if json_match:
            json_str = json_match.group(1)
            logger.info("✅ Found JSON in code block")
        
        # Strategy 2: Look for JSON object with more flexible regex
        if not json_str:
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response)
            if json_match:
                json_str = json_match.group(0)
                logger.info("✅ Found JSON with flexible regex")
        
        # Strategy 3: Simple start/end brace approach
        if not json_str:
            start_idx = response.find("{")
            end_idx = response.rfind("}") + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = response[start_idx:end_idx]
                logger.info("✅ Found JSON with start/end braces")
        
        if json_str:
            try:
                # Clean up common JSON issues
                json_str = json_str.strip()
                # Remove any trailing commas before closing braces
                json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
                # Fix common quote issues
                json_str = json_str.replace('"', '"').replace('"', '"')
                json_str = json_str.replace(''', "'").replace(''', "'")
                
                parsed_data = json.loads(json_str)

                # Also try to extract TSX code block if present in the original response
                if "render_code" not in parsed_data:
                    tsx_match = re.search(r'```(tsx|jsx)\s*([\s\S]*?)\s*```', response)
                    if tsx_match:
                        parsed_data["render_code"] = tsx_match.group(2).strip()
                
                # Validate the parsed data
                if not isinstance(parsed_data, dict):
                    raise ValueError("Response is not a dictionary")
                
                # Ensure required fields exist
                if "title" not in parsed_data:
                    parsed_data["title"] = "Content Slide"
                if "layout" not in parsed_data:
                    parsed_data["layout"] = "bullet_points"
                if "contents" not in parsed_data or not isinstance(parsed_data["contents"], list):
                    parsed_data["contents"] = []
                if "speaker_notes" not in parsed_data or not parsed_data.get("speaker_notes"):
                    # Build notes from text/bullets if available, in a natural teacher voice
                    bullets: list[str] = []
                    main_text: str = ""
                    for c in parsed_data.get("contents", []) or []:
                        if c.get("type") == "text" and isinstance(c.get("value"), str) and not main_text:
                            main_text = c["value"].strip()
                        if c.get("type") == "bullet_list" and isinstance(c.get("value"), list):
                            bullets.extend([str(x).strip() for x in c["value"] if str(x).strip()][:4])
                    # Prefer the topic title when slide title is generic
                    raw_title = (parsed_data.get("title") or "").strip()
                    if raw_title.lower() in {"content slide", "slide", "content"}:
                        title_for_notes = (topic_title or "this topic").strip()
                    else:
                        title_for_notes = raw_title or (topic_title or "this topic").strip()
                    # Compose a 55–95 word narration (no meta phrases like "in this slide")
                    pieces = []
                    pieces.append(f"Let's make sense of {title_for_notes.lower()}.")
                    if main_text:
                        pieces.append(main_text)
                    if bullets:
                        if len(bullets) == 1:
                            pieces.append(f"First, focus on {bullets[0].lower()}—why does it matter here?")
                        else:
                            lead = ", ".join([b.lower() for b in bullets[:2]])
                            tail = bullets[2].lower() if len(bullets) > 2 else None
                            if tail:
                                pieces.append(f"Notice how {lead}, and {tail}, fit together in a simple chain.")
                            else:
                                pieces.append(f"Notice how {lead} fit together in a simple chain.")
                    pieces.append("As we go, test yourself: could you explain this to a friend in one minute?")
                    base = " ".join(pieces)
                    # Keep within 90 words for readability
                    words = base.split()
                    if len(words) > 95:
                        base = " ".join(words[:95]) + "..."
                    parsed_data["speaker_notes"] = base
                
                # Apply intelligent positioning to contents
                parsed_data["contents"] = self._apply_intelligent_positioning(
                    parsed_data["contents"], 
                    parsed_data.get("layout", "bullet_points")
                )
                
                logger.info(f"✅ Successfully parsed slide response: {parsed_data.get('title', 'Unknown')}")
                return parsed_data
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ Failed to parse slide JSON: {e}")
                logger.error(f"❌ JSON string: {json_str}")
            except Exception as e:
                logger.error(f"❌ Slide parsing error: {e}")
        
        # If we get here, create a more informative fallback
        logger.warning("⚠️ Using fallback slide structure due to JSON parsing failure")
        # Derive brief notes from the response text to avoid generic captions
        clean_text = (response or "").strip().replace("\n", " ")
        if len(clean_text) > 400:
            clean_text = clean_text[:400].rsplit(" ", 1)[0] + "..."
        # Build a more contextual fallback using any available hints in the response
        inferred_title = topic_title or "Content Overview"
        # Try to derive a concise title from the first sentence if present
        first_period = clean_text.find(".")
        if first_period > 0:
            candidate_title = clean_text[:first_period].strip()
            if 6 <= len(candidate_title) <= 60:
                inferred_title = candidate_title
        data = {
            "title": inferred_title,
            "layout": "bullet_points",
            "contents": [
                {
                    "type": "text",
                    "value": clean_text if clean_text else "Key concepts overview",
                    "position": {"x": 10, "y": 20}
                }
            ],
            "speaker_notes": (
                clean_text[:320] if clean_text else f"Let's explore {inferred_title}. We'll cover the big idea, a couple of vivid examples, and a quick way to remember it."
            )
        }
        data["ready_for_playback"] = self._compute_ready_for_playback(data)
        return data

    def _build_render_code(self) -> str:
        """Return a TSX string that renders the slide using props.slide with progressive reveals."""
        return (
            "export default function Slide(props){\n"
            "  const { slide, showCaptions, isPlaying } = props;\n"
            "  const [step, setStep] = React.useState(0);\n"
            "  const bulletsSrc = [];\n"
            "  (slide.contents || []).forEach(c => { if (c && c.type === 'bullet_list' && Array.isArray(c.value)) bulletsSrc.push(...c.value); });\n"
            "  const mainText = (slide.contents || []).find(c => c && c.type === 'text');\n"
            "  React.useEffect(() => {\n"
            "    if (!isPlaying) return;\n"
            "    setStep(0);\n"
            "    const id = setInterval(() => setStep(s => Math.min(s + 1, bulletsSrc.length + 2)), 1100);\n"
            "    return () => clearInterval(id);\n"
            "  }, [isPlaying, slide && slide.id]);\n"
            "  const title = slide.title;\n"
            "  const visuals = (slide.contents || []).filter(c => c && (c.type === 'image' || c.type === 'diagram'));\n"
            "  return (\n"
            "    <View style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 24 }}>\n"
            "      {title ? (<Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>{title}</Text>) : null}\n"
            "      <View style={{ flex: 1, flexDirection: 'row' }}>\n"
            "        <View style={{ flex: 1, paddingRight: 12 }}>\n"
            "          {mainText && step >= 1 ? (<Text style={{ color: '#e5e7eb', fontSize: 16, lineHeight: 24 }}>{mainText.value || mainText.text}</Text>) : null}\n"
            "          {bulletsSrc.map((b, i) => (i < step - 1) ? (\n"
            "            <View key={'b'+i} style={{ flexDirection: 'row', marginTop: 8 }}><Text style={{ color: '#10b981', marginRight: 8 }}>•</Text><Text style={{ color: '#e5e7eb', flex: 1 }}>{String(b)}</Text></View>\n"
            "          ) : null)}\n"
            "        </View>\n"
            "        <View style={{ width: '40%', alignItems: 'center', justifyContent: 'center' }}>\n"
            "          {step >= Math.min(3, bulletsSrc.length) ? visuals.map((v, i) => {\n"
            "            if (v.type === 'diagram') {\n"
            "              const val = v.value || {};\n"
            "              if (val.asset_type === 'mermaid_diagram' && val.mermaid_code) {\n"
            "                return (<MermaidDiagram key={'d'+i} code={val.mermaid_code} style={{ width: '100%', height: 220, borderRadius: 8, marginVertical: 6 }} />);\n"
            "              }\n"
            "            }\n"
            "            const rawUrl = (typeof v.value === 'string') ? v.value : (v.value && v.value.image_url);\n"
            "            const url = (typeof utils !== 'undefined' && utils && utils.resolveImageUrl) ? utils.resolveImageUrl(rawUrl) : rawUrl;\n"
            "            return url ? (<Image key={'i'+i} source={{ uri: url }} style={{ width: '100%', height: 220, borderRadius: 8, marginVertical: 6 }} resizeMode=\"contain\" />) : null;\n"
            "          }) : null}\n"
            "        </View>\n"
            "      </View>\n"
            "      {showCaptions && slide.speaker_notes ? (\n"
            "        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10 }}>\n"
            "          <Text style={{ color: '#fff', fontSize: 12 }}>{slide.speaker_notes}</Text>\n"
            "        </View>\n"
            "      ) : null}\n"
            "    </View>\n"
            "  );\n"
            "}\n"
        )

    async def _refine_slide_with_llm(self, slide: Dict[str, Any]) -> Dict[str, Any]:
        """Ask the LLM to improve weak speaker notes and ensure render_code exists.

        This is a short, single-pass refinement using the already selected provider.
        """
        try:
            title = slide.get("title", "")
            contents = slide.get("contents", [])
            prompt = (
                "Improve the following educational slide to ensure it includes strong teacher-style speaker_notes (55–95 words, no meta language) "
                "and provide a working render_code module if missing. Use only the given slide data.\n\n"
                f"Slide JSON:\n{json.dumps({'title': title, 'contents': contents, 'speaker_notes': slide.get('speaker_notes')}, ensure_ascii=False)}\n\n"
                "Return COMPLETE JSON with optional keys: speaker_notes, render_code."
            )
            messages = [
                ConversationMessage(role=MessageRole.SYSTEM, content="You are an expert educator and UI coder."),
                ConversationMessage(role=MessageRole.USER, content=prompt),
            ]
            response, _ = await self.llm_client.generate_response(
                messages=messages,
                preferred_provider=self.preferred_provider,
                max_tokens=700,
                temperature=0.3,
            )
            # Extract minimal JSON
            data: Dict[str, Any] = {}
            try:
                m = re.search(r"```json\s*(\{[\s\S]*?\})\s*```", response)
                if m:
                    data = json.loads(m.group(1))
                else:
                    # fallback to braces
                    start = response.find("{")
                    end = response.rfind("}") + 1
                    if start >= 0 and end > start:
                        data = json.loads(re.sub(r",(\s*[}\]])", r"\\1", response[start:end]))
            except Exception:
                data = {}
            return data or {}
        except Exception:
            return {}

    def _apply_intelligent_positioning(self, contents: List[Dict[str, Any]], layout: str) -> List[Dict[str, Any]]:
        """
        Apply intelligent positioning to slide contents to prevent overlapping.
        """
        if not contents:
            return contents
            
        # Separate text and visual content
        text_contents = [c for c in contents if c.get("type") in ["text", "bullet_list"]]
        visual_contents = [c for c in contents if c.get("type") in ["image", "diagram"]]
        
        # Apply positioning based on layout
        if layout == "text_image":
            # Text on left, visual on right - give text more space
            for i, content in enumerate(text_contents):
                content["position"] = {"x": 5, "y": 20 + (i * 12)}
            for i, content in enumerate(visual_contents):
                content["position"] = {"x": 55, "y": 30 + (i * 15)}
                
        elif layout == "bullet_points":
            # Text at top, visual below - ensure text has enough space
            # For bullet points, give text more space and push visuals further right
            for i, content in enumerate(text_contents):
                content["position"] = {"x": 2, "y": 20 + (i * 8)}  # Start text further left
            for i, content in enumerate(visual_contents):
                content["position"] = {"x": 65, "y": 40 + (i * 10)}  # Push visuals further right
                
        elif layout == "full_text":
            # Visual in center, text around it
            for i, content in enumerate(text_contents):
                content["position"] = {"x": 5, "y": 20 + (i * 10)}
            for i, content in enumerate(visual_contents):
                content["position"] = {"x": 60, "y": 35 + (i * 15)}
                
        elif layout == "diagram":
            # Visual is primary, text at top
            for i, content in enumerate(text_contents):
                content["position"] = {"x": 5, "y": 10 + (i * 6)}
            for i, content in enumerate(visual_contents):
                content["position"] = {"x": 60, "y": 30 + (i * 10)}
        else:
            # Fallback: stagger content vertically with more spacing
            all_contents = text_contents + visual_contents
            for i, content in enumerate(all_contents):
                content["position"] = {"x": 10, "y": 20 + (i * 20)}
        
        return contents

    def _create_fallback_slide(self, topic: Dict[str, Any], slide_number: int) -> Dict[str, Any]:
        """Create a basic slide when generation fails."""
        title = topic.get("title", "Content Slide")
        description = topic.get("description", "")
        notes = f"This slide covers {title}. {description}".strip()
        data = {
            "id": str(uuid.uuid4()),
            "slide_number": slide_number,
            "type": SlideType.CONTENT.value,
            "layout": SlideLayout.BULLET_POINTS.value,
            "title": title,
            "contents": [
                {
                    "type": "bullet_list",
                    "value": topic.get("key_concepts", ["Key concept 1", "Key concept 2"]),
                    "position": {"x": 50, "y": 40}
                }
            ],
            "speaker_notes": notes or "In this section, we'll explore this topic and understand its key aspects.",
            "duration_seconds": 30.0,
            "sources": []
        }
        data["ready_for_playback"] = self._compute_ready_for_playback(data)
        return data

    async def _create_summary_slide(self, curriculum: Dict[str, Any], slide_number: int) -> Dict[str, Any]:
        """Create a summary slide for the presentation."""
        
        key_points = []
        for topic in curriculum.get("topics", []):
            key_points.extend(topic.get("key_concepts", [])[:2])  # Top 2 concepts per topic
        
        data = {
            "id": str(uuid.uuid4()),
            "slide_number": slide_number,
            "type": SlideType.SUMMARY.value,
            "layout": SlideLayout.BULLET_POINTS.value,
            "title": "Summary",
            "contents": [
                {
                    "type": "bullet_list",
                    "value": key_points[:6],  # Top 6 key points
                    "position": {"x": 50, "y": 40}
                }
            ],
            "speaker_notes": f"Let's summarize what we've learned about {curriculum.get('title', 'our topic')}. These key concepts form the foundation of understanding.",
            "duration_seconds": 25.0,
            "sources": []
        }
        data["ready_for_playback"] = self._compute_ready_for_playback(data)
        data["renderCode"] = self._build_render_code()
        return data

    def _get_relevant_sources(self, sources: List[Dict[str, Any]], key_concepts: List[str]) -> List[Dict[str, Any]]:
        """Find sources relevant to specific key concepts."""
        relevant_sources = []
        
        for source in sources[:3]:  # Limit to top 3 sources per slide
            relevant_sources.append({
                "type": "web",
                "title": source.get("title", "Unknown Source"),
                "id": source.get("url", ""),
                "excerpt": source.get("snippet", ""),
                "confidence": source.get("relevance_score", 0.7)
            })
        
        return relevant_sources

    async def run(self) -> None:
        """Process pending content tasks and exit when done."""
        logger.info(f"🚀 ContentDraftingAgent {self.agent_id} started")
        
        # Find and process pending tasks
        pending = None
        with memory_table("content_tasks") as db:
            for tid, meta in db.items():
                if meta.get("status") == "pending":
                    pending = (tid, meta)
                    break
                    
        if not pending:
            logger.info("📝 No pending content tasks found. Exiting.")
            return
            
        task_id, task_meta = pending
        logger.info(f"📝 Processing content task: {task_id}")
        
        # Mark as in progress
        with memory_table("content_tasks") as db:
            db[task_id] = {**task_meta, "status": "in_progress"}
        
        try:
            await self._perform_content_drafting(task_id, task_meta)
            logger.info(f"✅ Content task {task_id} completed successfully.")
        except Exception as e:
            logger.error(f"Content task {task_id} failed: {e}")
            # Task failure is already recorded in _perform_content_drafting


# Backward compatibility alias
ContentDraftingSubAgent = ContentDraftingAgent 

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    logger.info("[TEST] Running minimal LLM client test...")
    from shared.llm_client import get_llm_client
    llm = get_llm_client()
    from shared.models import ConversationMessage, MessageRole
    async def test_llm():
        try:
            messages = [
                ConversationMessage(role=MessageRole.SYSTEM, content="You are a helpful assistant."),
                ConversationMessage(role=MessageRole.USER, content="Say hello world in one sentence.")
            ]
            logger.info("[TEST] Calling LLM...")
            response, provider = await llm.generate_response(messages=messages, max_tokens=50, temperature=0.2)
            logger.info(f"[TEST] LLM call returned. Provider: {provider}, Response: {response}")
        except Exception as e:
            logger.error(f"[TEST] LLM call failed: {e}", exc_info=True)

    # --- NEW: Minimal agent curriculum test ---
    async def test_content_agent_curriculum():
        agent = ContentDraftingAgent("test")
        learning_goal = "Basics of neural networks"
        sources = [
            {"title": "Neural Networks 101", "snippet": "An introduction to neural networks."},
            {"title": "Deep Learning Basics", "snippet": "Covers the fundamentals of deep learning and neural nets."}
        ]
        logger.info("[TEST] Calling ContentDraftingAgent._generate_curriculum_outline...")
        try:
            curriculum = await agent._generate_curriculum_outline(learning_goal, sources)
            logger.info(f"[TEST] Curriculum outline returned: {curriculum}")
        except Exception as e:
            logger.error(f"[TEST] Curriculum outline call failed: {e}", exc_info=True)

    # Run both tests
    asyncio.run(test_llm())
    asyncio.run(test_content_agent_curriculum()) 