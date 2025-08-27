"""
Slide Designer Agent - Creates beautiful, educational slide decks using LangChain tools
"""

import logging
import json
import uuid
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from pydantic import BaseModel, Field

from langchain.tools import BaseTool, StructuredTool
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema import SystemMessage, HumanMessage
from langchain_core.tools import ToolException

from .models import (
    Slide, SlideType, SlideLayout, SlideContent, 
    SourceReference, Deck, DeckMetadata,
    SlideGenerationRequest, SlideGenerationResponse
)
from .langchain_config import LLMProvider
from .vector_db import get_vector_db, VectorDatabase

logger = logging.getLogger(__name__)

class SlideCreationInput(BaseModel):
    """Input for creating a single slide"""
    slide_type: str = Field(..., description="Type of slide: title, content, example, practice, quiz, summary")
    layout: str = Field(..., description="Layout: full_text, bullet_points, text_image, diagram, etc.")
    title: Optional[str] = Field(None, description="Slide title")
    content_blocks: List[Dict[str, Any]] = Field(default_factory=list, description="List of content blocks for the slide (optional for title slides)")
    speaker_notes: str = Field(..., description="What the AI teacher should say for this slide")
    duration_seconds: float = Field(30.0, description="How long to spend on this slide")
    sources: List[Union[Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Source references – each item can be a dict with metadata or a plain citation string",
    )

class ResearchInput(BaseModel):
    """Input for researching a topic"""
    query: str = Field(..., description="Research query")
    document_ids: List[str] = Field(default_factory=list, description="Document IDs to search in")
    max_results: int = Field(5, description="Maximum number of results")

class SlideDesignerTools:
    """Collection of tools for the Slide Designer Agent"""
    
    def __init__(self, vector_db: Optional[VectorDatabase] = None):
        self.vector_db = vector_db  # Will be set later if not provided
        self.created_slides: List[Slide] = []
        self.research_results: Dict[str, Any] = {}
    
    async def initialize_vector_db(self):
        """Initialize vector database asynchronously"""
        if not self.vector_db:
            self.vector_db = await get_vector_db()
    
    def create_research_tool(self) -> StructuredTool:
        """Tool for researching topics from documents and knowledge base"""
        
        async def research_topic(query: str, document_ids: List[str] = [], max_results: int = 5) -> str:
            try:
                logger.info(f"Researching: {query}")
                
                if not self.vector_db:
                    return json.dumps({"status": "error", "message": "Vector database not initialized"})
                
                import asyncio
                results = []
                try:
                    # This is the standard way to get the running loop
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                     # If no loop is running, this will be called.
                    loop = None

                # We can call the async function directly since we are in an async def
                results = await self.vector_db.similarity_search(
                    query=query,
                    collection_name="default",
                    top_k=max_results
                )
                
                # Format results
                formatted_results = []
                for i, result in enumerate(results):
                    source = {
                        "id": result.get("id", f"source_{i}"),
                        "title": result.get("metadata", {}).get("title", "Unknown Source"),
                        "excerpt": result.get("content", ""),
                        "confidence": result.get("score", 0.8),
                        "page": result.get("metadata", {}).get("page")
                    }
                    formatted_results.append(source)
                    
                self.research_results[query] = formatted_results
                
                return json.dumps({
                    "status": "success",
                    "query": query,
                    "results_found": len(formatted_results),
                    "sources": formatted_results
                })
                
            except Exception as e:
                logger.error(f"Research error: {e}")
                return json.dumps({"status": "error", "message": str(e)})
        
        return StructuredTool.from_function(
            func=research_topic,
            name="research_topic",
            description="Research a topic using documents and knowledge base. Returns relevant sources with excerpts.",
            args_schema=ResearchInput
        )
    
    def create_slide_tool(self) -> StructuredTool:
        """Tool for creating individual slides"""
        
        def create_slide(
            slide_type: str,
            layout: str,
            title: Optional[str] = None,
            content_blocks: List[Dict[str, Any]] = [],
            speaker_notes: str = "",
            duration_seconds: float = 30.0,
            sources: List[Union[Dict[str, Any], str]] = []
        ) -> str:
            try:
                # Validate slide type and layout
                if slide_type not in [t.value for t in SlideType]:
                    raise ToolException(f"Invalid slide type: {slide_type}")
                if layout not in [l.value for l in SlideLayout]:
                    raise ToolException(f"Invalid layout: {layout}")
                
                # Auto-generate content blocks when none are supplied (common for title slides or when LLM forgets)
                if not content_blocks:
                    # For a title slide, use the title as main text; otherwise derive bullets from speaker notes.
                    if slide_type == "title" and title:
                        content_blocks = [{"type": "text", "value": title}]
                    else:
                        # Derive up to 4 bullet sentences from speaker notes.
                        import re
                        sentences = re.split(r"(?<=[.!?]) +", speaker_notes)
                        bullets = [s.strip() for s in sentences if s.strip()][:4]
                        if not bullets:
                            bullets = [speaker_notes]
                        content_blocks = [{
                            "type": "bullet_list",
                            "value": bullets,
                            "position": {"x": 0, "y": 0}
                        }]
                
                # Ensure bullet_points layout has both bullet_list and summary text block
                if layout == "bullet_points":
                    bullet_blocks = [b for b in content_blocks if b.get("type") == "bullet_list"]
                    text_blocks = [b for b in content_blocks if b.get("type") == "text"]
                    # Add summary text block if missing or too short
                    if not text_blocks or len(text_blocks[0].get("value", "").split()) < 50:
                        summary_text = (
                            text_blocks[0]["value"] if text_blocks else ""
                        )
                        if not summary_text or len(summary_text.split()) < 50:
                            # Build summary from speaker notes or bullet sentences
                            if speaker_notes and len(speaker_notes.split()) > 50:
                                summary_text = speaker_notes
                            else:
                                summary_text = " ".join(bullet_blocks[0].get("value", [])[:5])
                        content_blocks.append({
                            "type": "text",
                            "value": summary_text,
                            "position": {"x": 10, "y": 70}
                        })
                
                # Ensure speaker_notes provide narrative explanation (>=40 words)
                if len(speaker_notes.split()) < 40:
                    # Generate basic explanatory notes from bullet list
                    if layout == "bullet_points" and content_blocks:
                        bullets = next((b["value"] for b in content_blocks if b.get("type") == "bullet_list"), [])
                        speaker_notes = (
                            "In this slide we talk about " + ", ".join(bullets[:3]) +
                            ". These points highlight the core idea and its importance."
                        )
                
                # Create slide content objects
                slide_contents = []
                # Determine default positions to prevent overlapping when positions are missing
                if layout == "bullet_points" and len(content_blocks) == 2:
                    # Expecting bullet_list + summary text
                    default_positions = [
                        {"x": 10, "y": 15},  # bullet list top-left
                        {"x": 10, "y": 70},  # summary text lower on slide
                    ]
                elif layout == "text_image" and len(content_blocks) == 2:
                    # Expecting text (or bullet) + image/diagram
                    # Put text left, image right.
                    default_positions = [
                        {"x": 5, "y": 20},   # text left
                        {"x": 60, "y": 20},  # image right
                    ]
                else:
                    # Fallback: stagger blocks vertically
                    default_positions = [
                        {"x": 10, "y": 10 + i * 40} for i in range(len(content_blocks))
                    ]

                # Build slide contents with reveal timing
                for idx, block in enumerate(content_blocks):
                    position = block.get("position") or (
                        default_positions[idx] if idx < len(default_positions) else {"x": 10, "y": 10 + idx * 40}
                    )

                    # Determine reveal timings: 0s then +2s increments
                    reveal_delay = block.get("reveal_delay")
                    reveal_order = block.get("reveal_order")
                    if reveal_delay is None:
                        reveal_delay = idx * 2.0  # 2-second spacing
                    if reveal_order is None:
                        reveal_order = idx

                    content = SlideContent(
                        type=block.get("type", "text"),
                        value=block.get("value", ""),
                        position=position,
                        style=block.get("style"),
                        animation=block.get("animation", "fade_in"),
                        reveal_delay=reveal_delay,
                        reveal_order=reveal_order,
                    )
                    slide_contents.append(content)
                
                # Create source references
                source_refs = []
                for source in sources:
                    # If the source is provided as a simple string (citation), convert it into a dict structure
                    if isinstance(source, str):
                        source = {
                            "type": "citation",
                            "title": source,
                            "excerpt": source,
                            "confidence": 0.8,
                        }

                    # Now safely extract fields assuming dict structure
                    ref = SourceReference(
                        type=source.get("type", "document"),
                        id=source.get("id"),
                        title=source.get("title", "Unknown"),
                        page=source.get("page"),
                        excerpt=source.get("excerpt"),
                        confidence=source.get("confidence", 0.8),
                    )
                    source_refs.append(ref)
                
                # Create slide
                slide = Slide(
                    id=f"slide_{len(self.created_slides) + 1}_{uuid.uuid4().hex[:8]}",
                    slide_number=len(self.created_slides) + 1,
                    type=SlideType(slide_type),
                    layout=SlideLayout(layout),
                    title=title,
                    contents=slide_contents,
                    speaker_notes=speaker_notes,
                    duration_seconds=duration_seconds,
                    sources=source_refs,
                    requires_interaction=slide_type in ["quiz", "practice"],
                    difficulty_level="medium",
                    auto_advance=True
                )
                
                self.created_slides.append(slide)
                
                return json.dumps({
                    "status": "success",
                    "slide_id": slide.id,
                    "slide_number": slide.slide_number,
                    "message": f"Created {slide_type} slide #{slide.slide_number}"
                })
                
            except Exception as e:
                logger.error(f"Slide creation error: {e}")
                return json.dumps({"status": "error", "message": str(e)})
        
        return StructuredTool.from_function(
            func=create_slide,
            name="create_slide",
            description="Create a new slide with specified content and layout",
            args_schema=SlideCreationInput
        )
    
    def get_tools(self) -> List[BaseTool]:
        """Get all available tools"""
        return [
            self.create_research_tool(),
            self.create_slide_tool()
        ]

class SlideDesignerAgent:
    """Agent responsible for designing educational slide decks"""
    
    def __init__(self, llm_provider: Optional[LLMProvider] = None, vector_db: Optional[VectorDatabase] = None):
        # Use OpenAI by default as create_openai_tools_agent currently generates
        # function call formats that are compatible with OpenAI models but not with
        # Anthropic's /v1/messages endpoint. Fallback logic in LLMProvider will
        # still try other providers if the OpenAI key is not set.
        from shared.config import get_settings
        settings = get_settings()
        self.llm = llm_provider or LLMProvider.get_llm(provider="openai", model=settings.openai_model)
        self.tools_manager = SlideDesignerTools(vector_db=vector_db)
        self.tools = self.tools_manager.get_tools()
    
    async def initialize(self):
        """Initialize async components"""
        await self.tools_manager.initialize_vector_db()
        
    def create_agent_executor(self) -> AgentExecutor:
        """Create the agent executor with tools"""
        
        system_prompt = """You are an a professor and has a PhD in the subject you are teaching and creating slides  teacin your studen. You are an expert educational slide designer.

Design constraints for EVERY call to the create_slide tool:
1️⃣  content_blocks MUST be provided and should match the chosen layout:
    • bullet_points layout → ONE bullet_list block (`type="bullet_list"`, `value=[...]`).
    • full_text layout   → ONE text block with a short paragraph (3-5 lines).
    • text_image layout  → at least one text/bullet block **and** one image/diagram block (`type="image"` or `diagram`).
2️⃣  Speaker notes should be a 2-3 sentence mini-lecture (≈30–40 sec of speech) that *expands* on the slide—don't just read the bullets.
3️⃣  Prefer explanatory or example slides over pure questions unless slide_type is *practice* or *quiz*.
4️⃣  Cite sources in the `sources` parameter when presenting factual information.

CONTENT RULES for every create_slide call:
• full_text layout  → ONE text block with **at least 120 words** that explains the concept in narrative form.
• bullet_points layout → ONE bullet_list block with **5-7 concise bullets** *plus* ONE text block summarising why it matters (≥60 words).
• text_image layout  → text or bullet list **and** an image/diagram block that illustrates the idea.

Speaker notes must:

• Teach/explain beyond what is visible—give context, analogies, cautionary notes.

Slide quality criteria:
• Avoid question-only slides except for practice/quiz.
• Cite sources in `sources` for factual claims.
• Use everyday language first, then introduce jargon.
• Aim for a learner with no prior knowledge.

SPEAKER NOTES POLICY (absolutely mandatory):
• Never read the bullet list word-for-word.
• Deliver a *mini-lecture* that expands on each point with examples, anecdotes, or analogies.
• Add transitional phrases ("first", "next", "consider", "importantly") and rhetorical questions to create a live-class feel.
• 45-70 words total (≈35–50 s of speech).
• The narration must *match the visual content* in scope but **not** duplicate text verbatim.

Overall deck structure:
• Title slide → big idea and motivation.
• 4-8 concept slides → progressive explanations.
• 1-2 example slides → concrete demonstrations.
• (optional) practice/quiz slide.
• Summary slide → key takeaways.

Teach with clarity and engagement. Avoid jargon without explanation."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_tools_agent(self.llm, self.tools, prompt)
        
        return AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=True,
            max_iterations=20,
            handle_parsing_errors=True
        )
    
    async def generate_slide_deck(self, request: SlideGenerationRequest) -> SlideGenerationResponse:
        """Generate a complete slide deck for a learning goal"""
        
        start_time = datetime.utcnow()
        
        try:
            # Reset tools for new deck
            self.tools_manager.created_slides = []
            self.tools_manager.research_results = {}
            
            # Create agent executor
            agent_executor = self.create_agent_executor()
            
            # Construct the input prompt
            input_prompt = f"""
            Create an educational slide deck for the following learning goal:
            \"{request.learning_goal}\"
            
            Requirements:
            - Target duration: {request.preferred_duration_minutes} minutes
            - Difficulty level: {request.difficulty_level}
            - Include practice: {request.include_practice}
            - Visual style: {request.visual_style}
            - Maximum slides: {request.max_slides}
            
            Available documents for research: {request.uploaded_documents}
            
            First, research the topic thoroughly, then create a comprehensive slide deck
            that teaches this topic effectively. Include source citations for all factual content.
            """
            
            # Run the agent
            result = await agent_executor.ainvoke({"input": input_prompt})
            
            # Create deck from generated slides
            slides = self.tools_manager.created_slides
            
            if not slides:
                raise Exception("No slides were generated")
            
            # Calculate metadata
            total_duration = sum(slide.duration_seconds for slide in slides) / 60
            topics = list(set([
                topic for slide in slides 
                for source in slide.sources 
                for topic in source.title.split() 
                if len(topic) > 4
            ]))[:10]  # Top 10 topics
            
            metadata = DeckMetadata(
                total_slides=len(slides),
                estimated_duration_minutes=total_duration,
                difficulty_level=request.difficulty_level,
                topics_covered=topics,
                learning_objectives=[request.learning_goal],
                generated_at=datetime.utcnow(),
                model_used="claude-3-sonnet-20240229",
                generation_params={
                    "visual_style": request.visual_style,
                    "include_practice": request.include_practice
                }
            )
            
            deck = Deck(
                deck_id=f"deck_{uuid.uuid4().hex}",
                user_id=request.user_id,
                learning_goal=request.learning_goal,
                title=slides[0].title or f"Learning: {request.learning_goal[:50]}",
                description=f"AI-generated lesson on {request.learning_goal}",
                slides=slides,
                metadata=metadata,
                voice_id="default",
                voice_speed=1.0,
                allow_branching=True,
                student_level="beginner"
            )
            
            # Calculate generation metrics
            end_time = datetime.utcnow()
            generation_time = (end_time - start_time).total_seconds()
            
            # Estimate tokens (rough approximation)
            total_text = " ".join([
                slide.speaker_notes + " ".join([c.value for c in slide.contents if isinstance(c.value, str)])
                for slide in slides
            ])
            estimated_tokens = int(len(total_text.split()) * 1.3)
            
            response = SlideGenerationResponse(
                deck=deck,
                generation_time_seconds=generation_time,
                tokens_used=estimated_tokens,
                sources_consulted=len(self.tools_manager.research_results),
                status="completed",
                warnings=[]
            )
            
            logger.info(f"Generated deck with {len(slides)} slides in {generation_time:.2f}s")
            return response
            
        except Exception as e:
            logger.error(f"Error generating slide deck: {e}")
            # Return partial response with error
            return SlideGenerationResponse(
                deck=None,
                generation_time_seconds=0,
                tokens_used=0,
                sources_consulted=0,
                status="failed",
                warnings=[str(e)]
            )

# Factory function
async def create_slide_designer_agent(vector_db: Optional[VectorDatabase] = None) -> SlideDesignerAgent:
    """Create and return a configured Slide Designer Agent"""
    agent = SlideDesignerAgent(vector_db=vector_db)
    await agent.initialize()
    return agent