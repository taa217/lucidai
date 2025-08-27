"""Enhanced VisualDesignerAgent with DALL-E image generation and Mermaid diagrams (Phase 4.2)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import base64
import os
import re
from typing import Dict, List, Any, Optional
from datetime import datetime

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from shared.config import get_settings
from shared.llm_client import get_llm_client
from shared.models import ConversationMessage, MessageRole

from .agent_base import AgentBase
from .shared_memory import memory_table

logger = logging.getLogger(__name__)


class VisualDesignerAgent(AgentBase):
    """Advanced visual designer agent that creates educational images and diagrams for slides."""

    def __init__(self, agent_id: str = "main") -> None:
        super().__init__(f"visual-{agent_id}")
        self.agent_id = agent_id
        self.llm_client = get_llm_client()
        settings = get_settings()
        
        # Initialize image generation clients with fallback support
        self.image_providers = {}
        
        # OpenAI DALL-E client
        try:
            from openai import AsyncOpenAI
            if settings.openai_api_key:
                client_kwargs = {"api_key": settings.openai_api_key}
                if getattr(settings, "openai_organization", None):
                    client_kwargs["organization"] = settings.openai_organization
                if getattr(settings, "openai_project", None):
                    client_kwargs["project"] = settings.openai_project
                self.image_providers['openai'] = AsyncOpenAI(**client_kwargs)
                logger.info("✅ OpenAI DALL-E client initialized")
            else:
                logger.warning("No OpenAI API key found, DALL-E generation disabled")
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAI client: {e}")
        
        # Google Gemini client
        try:
            import google.generativeai as genai
            if settings.google_api_key:
                genai.configure(api_key=settings.google_api_key)
                self.image_providers['gemini'] = genai
                logger.info("✅ Google Gemini client initialized")
            else:
                logger.warning("No Google API key found, Gemini generation disabled")
        except ImportError:
            logger.warning("Google Generative AI package not installed")
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini client: {e}")
        
        # Set preferred provider (can be configured via environment variable)
        self.preferred_provider = os.getenv('IMAGE_GENERATION_PROVIDER', 'gemini')  # Default to Gemini
        if self.preferred_provider not in self.image_providers:
            # Fallback to first available provider
            self.preferred_provider = list(self.image_providers.keys())[0] if self.image_providers else None
        
        logger.info(f"🎨 Image generation providers available: {list(self.image_providers.keys())}")
        logger.info(f"🎨 Preferred provider: {self.preferred_provider}")

    def _calculate_intelligent_position(self, slide: Dict[str, Any], visual_type: str, content_index: int = 0) -> Dict[str, float]:
        """
        Calculate optimal position for visual content based on slide layout and existing content.
        This prevents overlapping between text and images/diagrams.
        """
        layout = slide.get("layout", "bullet_points")
        existing_contents = slide.get("contents", [])
        
        # Count existing content types
        text_contents = [c for c in existing_contents if c.get("type") in ["text", "bullet_list"]]
        image_contents = [c for c in existing_contents if c.get("type") in ["image", "diagram"]]
        
        # Define position strategies based on layout and content
        if layout == "text_image":
            # Text-image layout: text on left, image on right
            if visual_type in ["conceptual_diagram", "educational_image", "mermaid_diagram"]:
                # Place image/diagram on the right side, but not too far right
                return {"x": 55, "y": 30}
            else:
                # Place other content on the left
                return {"x": 10, "y": 25}
                
        elif layout == "bullet_points":
            # Bullet points layout: text at top, visual below
            if visual_type in ["conceptual_diagram", "educational_image", "mermaid_diagram"]:
                # Place visual below text content, but not too low and further right
                return {"x": 65, "y": 40}
            else:
                # Place text content at top
                return {"x": 10, "y": 20}
                
        elif layout == "full_text":
            # Full text layout: visual in center, text around it
            if visual_type in ["conceptual_diagram", "educational_image", "mermaid_diagram"]:
                # Place visual in center, but slightly to the right
                return {"x": 60, "y": 35}
            else:
                # Place text content
                return {"x": 10, "y": 20}
                
        elif layout == "diagram":
            # Diagram-focused layout: visual is primary
            if visual_type in ["conceptual_diagram", "educational_image", "mermaid_diagram"]:
                # Place visual in center, but not too large
                return {"x": 60, "y": 30}
            else:
                # Place supporting text at top
                return {"x": 10, "y": 10}
        
        # Fallback: smart positioning based on content count
        if len(text_contents) == 0:
            # No text content, center the visual
            return {"x": 50, "y": 40}
        elif len(image_contents) == 0:
            # No existing images, place visual on right
            return {"x": 60, "y": 30}
        else:
            # Multiple contents, stagger them
            if visual_type in ["conceptual_diagram", "educational_image", "mermaid_diagram"]:
                # Place visual on right side, but not too far right
                return {"x": 60, "y": 30 + (content_index * 10)}
            else:
                # Place text on left side
                return {"x": 10, "y": 20 + (content_index * 15)}

    def _calculate_intelligent_size(self, visual_type: str, layout: str) -> Dict[str, float]:
        """
        Calculate optimal size for visual content based on type and layout.
        """
        if visual_type == "mermaid_diagram":
            if layout == "text_image":
                return {"width": 30, "height": 35}  # Smaller for side-by-side
            elif layout == "bullet_points":
                return {"width": 35, "height": 40}  # Medium for bullet points
            else:
                return {"width": 60, "height": 45}  # Larger for centered
                
        elif visual_type in ["conceptual_diagram", "educational_image"]:
            if layout == "text_image":
                return {"width": 35, "height": 40}  # Smaller for side-by-side
            elif layout == "bullet_points":
                return {"width": 30, "height": 35}  # Even smaller for bullet points to prevent overlap
            elif layout == "diagram":
                return {"width": 60, "height": 50}  # Larger for diagram-focused
            else:
                return {"width": 45, "height": 35}  # Medium for other layouts
                
        else:
            # Default sizes - keep them smaller to prevent overlap
            return {"width": 35, "height": 30}

    @AgentBase.retryable  # type: ignore[misc]
    async def _perform_visual_design(self, task_id: str, task: Dict[str, Any]) -> None:
        """Generate visual assets for slides using AI image generation."""
        objective = task.get("objective", "")
        learning_goal = task.get("learning_goal", "")
        
        logger.info(f"🎨 Starting visual design for: {objective}")
        
        try:
            # Get slide contents from shared memory
            slides = await self._get_slide_contents()
            logger.info(f"📄 Retrieved {len(slides)} slides for visual design.")
            
            # Analyze visual needs with timeout
            logger.info("⏳ Analyzing visual needs (timeout: 30s)...")
            try:
                visual_plan = await asyncio.wait_for(
                    self._analyze_visual_needs(slides, learning_goal),
                    timeout=60  # Give analysis more time to avoid timeouts
                )
                logger.info(f"📋 Visual plan generated: {visual_plan}")
            except asyncio.TimeoutError:
                logger.error("❌ Visual analysis timed out after 30 seconds!")
                raise Exception("Visual analysis timed out")
            
            # Generate visual assets with timeout
            logger.info("⏳ Generating visual assets (timeout: 120s)...")
            try:
                visual_assets = await asyncio.wait_for(
                    self._generate_visual_assets(visual_plan, learning_goal),
                    timeout=120  # Reduced from 300 to 120 seconds
                )
                logger.info(f"🖼️ Visual assets generated: {len(visual_assets)} assets")
            except asyncio.TimeoutError:
                logger.error("❌ Visual asset generation timed out after 120 seconds!")
                raise Exception("Visual asset generation timed out")
            
            # Store results in shared memory
            with memory_table("visual_tasks") as db:
                db[task_id] = {
                    **task,
                    "status": "done",
                    "completed_at": datetime.utcnow().isoformat(),
                    "visual_plan": visual_plan,
                    "total_assets_generated": len(visual_assets),
                    "visual_assets": visual_assets
                }
                logger.info(f"✅ Visual task {task_id} marked as done and stored in shared memory.")
            
            logger.info(f"✅ Visual design completed: {len(visual_assets)} assets generated")
            
        except Exception as e:
            logger.error(f"❌ Visual design failed for task {task_id}: {str(e)}")
            with memory_table("visual_tasks") as db:
                db[task_id] = {
                    **task,
                    "status": "failed",
                    "error": str(e),
                    "completed_at": datetime.utcnow().isoformat(),
                    "result": []
                }
            raise

    async def _get_slide_contents(self) -> List[Dict[str, Any]]:
        """Retrieve available slide content (including in-progress) for visuals."""
        all_slides = []
        with memory_table("content_tasks") as db:
            for _, task_data in db.items():
                if task_data.get("status") in ("in_progress", "done"):
                    all_slides.extend(task_data.get("slides", []) or [])
        logger.info(f"🎯 Retrieved {len(all_slides)} slides for visual enhancement")
        return all_slides

    async def _analyze_visual_needs(self, slides: List[Dict[str, Any]], learning_goal: str) -> Dict[str, Any]:
        """Analyze which slides need visual enhancements and what type of visuals."""
        
        # Prepare detailed slide information including content and speaker notes
        detailed_slides = []
        for slide in slides:
            slide_info = {
                "slide_number": slide.get("slide_number"),
                "title": slide.get("title"),
                "type": slide.get("type"),
                "layout": slide.get("layout"),
                "contents": slide.get("contents", []),
                "speaker_notes": slide.get("speaker_notes", ""),
                "duration_seconds": slide.get("duration_seconds", 30)
            }
            detailed_slides.append(slide_info)
        
        analysis_prompt = f"""
Analyze these educational slides about "{learning_goal}" and determine which slides would benefit from visual enhancements.

IMPORTANT: You have access to the FULL slide content including speaker notes and bullet points. Use this detailed context to create ACCURATE and SPECIFIC visual descriptions.

Slides to analyze:
{json.dumps(detailed_slides, indent=2)}

For each slide, determine:
1. Whether it needs visual enhancement (image, diagram, or none)
2. What type of visual would be most educational
3. SPECIFIC visual description that accurately reflects the slide content

Visual Types:
- "educational_image": Photorealistic images showing real-world examples, scenarios, or objects
- "conceptual_diagram": Abstract diagrams showing relationships, processes, or concepts  
- "mermaid_diagram": Flowcharts, process diagrams, or structured visualizations
- "illustration": Custom illustrations for complex concepts
- "none": No visual needed

IMPORTANT GUIDELINES:
- For technical topics like electronics, physics, or engineering: Most content slides should have diagrams or illustrations
- Title and summary slides typically don't need visuals
- Focus on diagrams that show processes, components, or relationships
- Prefer "conceptual_diagram" for technical explanations
- Use the speaker notes and slide contents to understand EXACTLY what concepts need visualization
- Create SPECIFIC descriptions that match the educational content, not generic ones
- For semiconductor topics: Include energy band diagrams, doping illustrations, p-n junctions, etc.
- For neural networks: Include neuron diagrams, layer structures, activation functions, etc.
- For physics: Include force diagrams, energy diagrams, wave patterns, etc.

Respond in COMPLETE JSON format:
{{
    "visual_plan": [
        {{
            "slide_number": 1,
            "slide_title": "Title",
            "visual_type": "educational_image|conceptual_diagram|mermaid_diagram|illustration|none",
            "visual_description": "SPECIFIC description matching the slide content exactly",
            "reasoning": "Why this visual type is best for this slide",
            "content_context": "Brief summary of what the slide teaches"
        }}
    ],
    "total_visuals_needed": 3
}}

Ensure the JSON is complete and properly closed with all brackets.
"""

        try:
            messages = [
                ConversationMessage(role=MessageRole.SYSTEM, content="You are an expert educational visual designer analyzing slide content for optimal visual enhancements. You specialize in technical and scientific diagrams. Your job is to create SPECIFIC and ACCURATE visual descriptions that exactly match the educational content of each slide. Use the full slide content, speaker notes, and bullet points to understand exactly what concepts need visualization."),
                ConversationMessage(role=MessageRole.USER, content=analysis_prompt)
            ]
            
            response, _ = await self.llm_client.generate_response(
                messages=messages,
                max_tokens=1500,
                temperature=0.2
            )
            
            # Extract JSON from response with improved parsing
            logger.info(f"📝 Raw visual analysis response: {response[:300]}...")
            
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
                    
                    visual_plan = json.loads(json_str)
                    logger.info(f"📋 Visual plan created: {visual_plan.get('total_visuals_needed', 0)} visuals needed")
                    # Guard: If the LLM decides 0 visuals, fall back to a heuristic plan
                    total_needed = int(visual_plan.get("total_visuals_needed", 0) or 0)
                    plan_items = visual_plan.get("visual_plan") or []
                    non_none = [p for p in plan_items if (p or {}).get("visual_type") != "none"]
                    if total_needed == 0 or not non_none:
                        logger.info("🎯 Forcing fallback visual plan because the analysis returned no visuals")
                        return self._create_fallback_visual_plan(slides)
                    return visual_plan
                except json.JSONDecodeError as json_err:
                    logger.error(f"❌ Failed to parse visual plan JSON: {json_err}")
                    logger.error(f"❌ JSON string: {json_str}")
            
            # If we get here, use fallback
            logger.warning("⚠️ Using fallback visual plan due to JSON parsing failure")
            return self._create_fallback_visual_plan(slides)
                
        except Exception as e:
            logger.warning(f"Failed to analyze visual needs: {e}")
            return self._create_fallback_visual_plan(slides)

    def _create_fallback_visual_plan(self, slides: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create a basic visual plan as fallback."""
        visual_plan = []
        
        for slide in slides:
            slide_type = slide.get("type", "content")
            slide_number = slide.get("slide_number", 1)
            title = slide.get("title", "Slide")
            
            # More aggressive diagram creation for technical content
            if slide_type == "title":
                visual_type = "none"
                description = "Title slides typically don't need visuals"
            elif slide_type == "summary":
                visual_type = "conceptual_diagram" 
                description = f"Summary diagram showing key concepts from {title}"
            else:
                # For content slides, prefer conceptual diagrams for technical topics
                visual_type = "conceptual_diagram"
                description = f"Educational diagram illustrating {title} with clear visual elements showing the key concepts and relationships"
            
            visual_plan.append({
                "slide_number": slide_number,
                "slide_title": title,
                "visual_type": visual_type,
                "visual_description": description,
                "reasoning": f"Fallback visual plan for {slide_type} slide - focusing on educational clarity",
                "content_context": f"Slide about {title} with {slide_type} layout"
            })
        
        return {
            "visual_plan": visual_plan,
            "total_visuals_needed": len([v for v in visual_plan if v["visual_type"] != "none"])
        }

    async def _generate_visual_assets(self, visual_plan: Dict[str, Any], learning_goal: str) -> List[Dict[str, Any]]:
        """Generate actual visual assets based on the visual plan."""
        visual_assets = []
        
        # Get slide data for intelligent positioning
        slides = await self._get_slide_contents()
        slide_map = {slide.get("slide_number"): slide for slide in slides}
        
        for plan_item in visual_plan.get("visual_plan", []):
            visual_type = plan_item.get("visual_type")
            slide_number = plan_item.get("slide_number")
            
            if visual_type == "none":
                continue
                
            try:
                # Get slide data for positioning
                slide_data = slide_map.get(slide_number, {})
                layout = slide_data.get("layout", "bullet_points")
                
                # Calculate intelligent position and size
                position = self._calculate_intelligent_position(slide_data, visual_type)
                size = self._calculate_intelligent_size(visual_type, layout)
                
                asset = None
                
                if visual_type == "educational_image":
                    asset = await self._generate_image(plan_item, learning_goal, "educational_image", position, size)
                elif visual_type == "mermaid_diagram":
                    asset = await self._generate_mermaid_diagram(plan_item, learning_goal, position, size)
                elif visual_type in ["conceptual_diagram", "illustration"]:
                    asset = await self._generate_image(plan_item, learning_goal, "conceptual_diagram", position, size)
                
                if asset:
                    visual_assets.append(asset)
                    # Stream the asset onto the corresponding slide in content memory for incremental UX
                    with memory_table("content_tasks") as db:
                        for tid, rec in db.items():
                            if rec.get("status") in ("in_progress", "done"):
                                for slide in rec.get("slides", []):
                                    if slide.get("slide_number") == slide_number:
                                        slide_contents = list(slide.get("contents", []))
                                        slide_contents.append(asset)
                                        slide["contents"] = slide_contents
                                        # bump slide version to force stream update detection
                                        try:
                                            slide["version"] = int(slide.get("version", 0)) + 1
                                        except Exception:
                                            slide["version"] = 1
                                        db[tid] = rec
                                        try:
                                            from .shared_memory import append_event  # type: ignore
                                            append_event({
                                                "type": "visual_added",
                                                "payload": {"slide_number": slide_number, "asset": asset}
                                            })
                                        except Exception:
                                            pass
                                        break
                    
            except Exception as e:
                logger.warning(f"Failed to generate visual for slide {plan_item.get('slide_number')}: {e}")
                # Continue with other visuals
                continue
        
        # If nothing was generated (e.g., providers failed or plan had none), try a minimal fallback
        if not visual_assets:
            try:
                logger.info("🎯 No visual assets generated from plan; attempting minimal fallback on first 3 content slides")
                fallback_plan = self._create_fallback_visual_plan(slides)
                limited = [p for p in fallback_plan.get("visual_plan", []) if p.get("visual_type") != "none"][:3]
                for plan_item in limited:
                    slide_data = slide_map.get(plan_item.get("slide_number"), {})
                    layout = slide_data.get("layout", "bullet_points")
                    position = self._calculate_intelligent_position(slide_data, plan_item.get("visual_type"))
                    size = self._calculate_intelligent_size(plan_item.get("visual_type"), layout)
                    asset = await self._generate_image(plan_item, learning_goal, "conceptual_diagram", position, size)
                    if asset:
                        visual_assets.append(asset)
            except Exception as e:
                logger.warning(f"Fallback visual generation failed: {e}")
        
        return visual_assets

    async def _generate_image(self, plan_item: Dict[str, Any], learning_goal: str, image_type: str = "educational_image", position: Dict[str, float] = None, size: Dict[str, float] = None) -> Dict[str, Any]:
        """Generate educational image using the best available provider (Gemini or DALL-E)."""
        
        # Create educational prompt
        slide_title = plan_item.get("slide_title", "")
        description = plan_item.get("visual_description", "")
        content_context = plan_item.get("content_context", "")
        reasoning = plan_item.get("reasoning", "")
        
        # Enhanced prompt for better educational diagrams with full context
        image_prompt = f"""
Create an educational diagram for "{slide_title}" in a lesson about {learning_goal}.

CONTEXT: {content_context}

SPECIFIC VISUAL REQUIREMENTS: {description}

REASONING: {reasoning}

Style requirements:
- Clean, professional educational diagram
- High contrast and clear details
- Suitable for academic presentation slides
- Use simple, clear visual elements
- Avoid text overlays or complex backgrounds
- Focus on clarity and educational value
- Use 2-3 colors maximum for clarity
- Make it suitable for teaching and learning
- Ensure the diagram EXACTLY matches the educational content described

The diagram should be immediately understandable and educational, accurately representing the specific concepts taught in this slide.
"""

        # Use provided position and size or calculate defaults
        final_position = position or {"x": 50, "y": 30}
        final_size = size or {"width": 45, "height": 35}
        
        # Try providers in order of preference
        providers_to_try = [self.preferred_provider] if self.preferred_provider else []
        providers_to_try.extend([p for p in self.image_providers.keys() if p != self.preferred_provider])
        
        for provider in providers_to_try:
            try:
                if provider == 'openai':
                    return await self._generate_openai_image(plan_item, image_prompt, image_type, final_position, final_size)
                elif provider == 'gemini':
                    return await self._generate_gemini_image(plan_item, image_prompt, image_type, final_position, final_size)
            except Exception as e:
                logger.warning(f"❌ {provider.upper()} image generation failed: {e}")
                continue
        
        # If all providers failed, create placeholder
        logger.error(f"❌ All image generation providers failed for slide {plan_item.get('slide_number')}")
        return self._create_placeholder_asset(plan_item, image_type, final_position, final_size)

    async def _generate_openai_image(self, plan_item: Dict[str, Any], prompt: str, image_type: str, position: Dict[str, float], size: Dict[str, float]) -> Dict[str, Any]:
        """Generate image using OpenAI DALL-E."""
        slide_title = plan_item.get("slide_title", "")
        description = plan_item.get("visual_description", "")
        
        logger.info(f"🎨 Generating OpenAI DALL-E image for slide {plan_item.get('slide_number')}: {slide_title}")
        
        openai_client = self.image_providers['openai']
        response = await openai_client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1
        )
        
        image_url = response.data[0].url
        revised_prompt = getattr(response.data[0], 'revised_prompt', prompt)
        
        logger.info(f"✅ OpenAI DALL-E image generated successfully for slide {plan_item.get('slide_number')}")
        
        return {
            "asset_id": str(uuid.uuid4()),
            "slide_number": plan_item.get("slide_number"),
            "asset_type": image_type,
            "image_url": image_url,
            "description": description,
            "prompt_used": revised_prompt,
            "generated_at": datetime.utcnow().isoformat(),
            "provider": "openai",
            "position": position,
            "size": size
        }

    async def _generate_gemini_image(self, plan_item: Dict[str, Any], prompt: str, image_type: str, position: Dict[str, float], size: Dict[str, float]) -> Dict[str, Any]:
        """Generate image using Google Gemini."""
        slide_title = plan_item.get("slide_title", "")
        description = plan_item.get("visual_description", "")

        logger.info(f"🎨 Generating Google Gemini image for slide {plan_item.get('slide_number')}: {slide_title}")

        genai = self.image_providers['gemini']

        # Use the correct model for image generation
        model = genai.GenerativeModel('gemini-2.0-flash-preview-image-generation')

        # Generate image using Gemini's image generation
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={
                    "response_modalities": ["TEXT", "IMAGE"],
                    "temperature": 0.4,
                    "top_p": 0.8,
                    "top_k": 40,
                    "max_output_tokens": 2048,
                }
            ),
            timeout=30.0 # Reduced from 60 to 30 seconds
        )

        # Extract image data from response
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content') and candidate.content:
                for part in candidate.content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        image_data = part.inline_data.data
                        image_url = await self._save_gemini_image(image_data, plan_item.get("slide_number"))
                        logger.info(f"✅ Google Gemini image generated successfully for slide {plan_item.get('slide_number')}")
                        return {
                            "asset_id": str(uuid.uuid4()),
                            "slide_number": plan_item.get("slide_number"),
                            "asset_type": image_type,
                            "image_url": image_url,
                            "description": description,
                            "prompt_used": prompt,
                            "generated_at": datetime.utcnow().isoformat(),
                            "provider": "gemini",
                            "position": position,
                            "size": size
                        }
        raise Exception("No image data found in Gemini response")

    async def _save_gemini_image(self, image_data: str, slide_number: int) -> str:
        """Save Gemini image data to file and return URL."""
        try:
            import base64
            import os
            import re
            import logging
            
            # Log the first 100 characters for debugging
            logger = logging.getLogger(__name__)
            logger.info(f"Gemini image_data (first 100 chars): {image_data[:100]}")
            
            # Create images directory if it doesn't exist
            PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            images_dir = os.path.join(PROJECT_ROOT, "storage", "generated_images")
            os.makedirs(images_dir, exist_ok=True)
            
            # Generate filename
            filename = f"gemini_slide_{slide_number}_{int(datetime.utcnow().timestamp())}.png"
            filepath = os.path.join(images_dir, filename)
            
            # Handle both bytes and string for image_data
            if isinstance(image_data, bytes):
                image_bytes = image_data
            else:
                # If image_data is a data URI, strip the prefix
                if image_data.startswith('data:image'):
                    image_data = re.sub('^data:image/\\w+;base64,', '', image_data)
                image_bytes = base64.b64decode(image_data)
            with open(filepath, 'wb') as f:
                f.write(image_bytes)
            
            # Return relative URL for frontend access
            return f"/storage/generated_images/{filename}"
            
        except Exception as e:
            logger.error(f"Failed to save Gemini image: {e}")
            # Return a placeholder URL
            return "https://via.placeholder.com/400x300/374151/60a5fa?text=Gemini+Image"



    async def _generate_mermaid_diagram(self, plan_item: Dict[str, Any], learning_goal: str, position: Dict[str, float], size: Dict[str, float]) -> Dict[str, Any]:
        """Generate Mermaid diagram code for flowcharts and process diagrams."""
        
        slide_title = plan_item.get("slide_title", "")
        description = plan_item.get("visual_description", "")
        content_context = plan_item.get("content_context", "")
        reasoning = plan_item.get("reasoning", "")
        
        mermaid_prompt = f"""
Create a Mermaid diagram for "{slide_title}" in a lesson about {learning_goal}.

CONTEXT: {content_context}

SPECIFIC VISUAL REQUIREMENTS: {description}

REASONING: {reasoning}

Generate clean, educational Mermaid diagram code that shows:
- Clear process flow or relationships
- Appropriate diagram type (flowchart, graph, sequence, etc.)
- Readable labels and connections
- Educational value for understanding concepts
- EXACTLY matches the educational content described

Return ONLY the Mermaid diagram code (starting with the diagram type declaration).

Example format:
flowchart TD
    A[Start] --> B[Process]
    B --> C[Decision]
    C -->|Yes| D[Action]
    C -->|No| E[Alternative]

IMPORTANT: The diagram must accurately represent the specific concepts and relationships described in the visual requirements.
"""

        try:
            messages = [
                ConversationMessage(role=MessageRole.SYSTEM, content="You are an expert at creating educational Mermaid diagrams for teaching purposes."),
                ConversationMessage(role=MessageRole.USER, content=mermaid_prompt)
            ]
            
            response, _ = await self.llm_client.generate_response(
                messages=messages,
                max_tokens=800,
                temperature=0.2
            )
            
            # Extract Mermaid code (usually starts with diagram type)
            mermaid_code = response.strip()
            
            # Basic validation - should start with a known diagram type
            valid_starts = ["flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram"]
            if not any(mermaid_code.startswith(start) for start in valid_starts):
                # Try to extract just the diagram part
                lines = mermaid_code.split('\n')
                for i, line in enumerate(lines):
                    if any(line.strip().startswith(start) for start in valid_starts):
                        mermaid_code = '\n'.join(lines[i:])
                        break
            
            return {
                "asset_id": str(uuid.uuid4()),
                "slide_number": plan_item.get("slide_number"),
                "asset_type": "mermaid_diagram",
                "mermaid_code": mermaid_code,
                "description": description,
                "generated_at": datetime.utcnow().isoformat(),
                "position": position,
                "size": size
            }
            
        except Exception as e:
            logger.warning(f"Mermaid diagram generation failed: {e}")
            return self._create_placeholder_asset(plan_item, "mermaid_diagram", position, size)

    def _create_placeholder_asset(self, plan_item: Dict[str, Any], asset_type: str, position: Dict[str, float] = None, size: Dict[str, float] = None) -> Dict[str, Any]:
        """Create a placeholder visual asset when generation fails."""
        return {
            "asset_id": str(uuid.uuid4()),
            "slide_number": plan_item.get("slide_number"),
            "asset_type": asset_type,
            "placeholder": True,
            "description": plan_item.get("visual_description", "Placeholder visual"),
            "generated_at": datetime.utcnow().isoformat(),
            "position": position or {"x": 50, "y": 40},
            "size": size or {"width": 40, "height": 30}
        }

    async def run(self) -> None:
        """Process pending visual design tasks and exit when done."""
        logger.info(f"🚀 VisualDesignerAgent {self.agent_id} started")
        
        # Find and process pending tasks
        pending = None
        with memory_table("visual_tasks") as db:
            for tid, meta in db.items():
                if meta.get("status") == "pending":
                    pending = (tid, meta)
                    break
                    
        if not pending:
            logger.info("🎨 No pending visual design tasks found. Exiting.")
            return
            
        task_id, task_meta = pending
        logger.info(f"🎨 Processing visual design task: {task_id}")
        
        # Mark as in progress
        with memory_table("visual_tasks") as db:
            db[task_id] = {**task_meta, "status": "in_progress"}
        
        try:
            await self._perform_visual_design(task_id, task_meta)
            logger.info(f"✅ Visual design task {task_id} completed successfully.")
        except Exception as e:
            logger.error(f"Visual design task {task_id} failed: {e}")
            # Task failure is already recorded in _perform_visual_design 