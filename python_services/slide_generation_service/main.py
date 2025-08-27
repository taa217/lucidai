"""
Slide Generation Service - Generates educational slide decks using AI
"""

import os
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from datetime import datetime

# Import our modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from shared.models import SlideGenerationRequest, SlideGenerationResponse
from shared.slide_designer_agent import create_slide_designer_agent, SlideDesignerAgent
from shared.vector_db import get_vector_db, VectorDatabase
from shared.langchain_config import get_document_content, LLMProvider
from shared.config import debug_settings
from langchain.prompts import ChatPromptTemplate
from langchain.schema import HumanMessage, SystemMessage
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
slide_designer: Optional[SlideDesignerAgent] = None
vector_db: Optional[VectorDatabase] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    global slide_designer, vector_db
    
    try:
        # Debug environment variables
        logger.info("🔍 Debugging environment variables...")
        debug_settings()
        
        # Initialize vector database
        vector_db = await get_vector_db()
        logger.info("Vector database initialized")
        
        # Initialize slide designer agent
        slide_designer = await create_slide_designer_agent(vector_db=vector_db)
        logger.info("Slide Designer Agent initialized")
        
        logger.info("Slide Generation Service started successfully")
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    
    yield
    
    logger.info("Shutting down Slide Generation Service")

app = FastAPI(
    title="Slide Generation Service",
    description="AI-powered educational slide deck generation with source attribution",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Slide Generation Service",
        "status": "healthy",
        "version": "1.0.0",
        "capabilities": [
            "slide_generation",
            "source_attribution",
            "adaptive_content",
            "multi_layout_support"
        ],
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        status = {
            "service": "slide_generation_service",
            "status": "healthy",
            "components": {
                "slide_designer": "active" if slide_designer else "inactive",
                "vector_db": "active" if vector_db else "inactive"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return status
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {
            "service": "slide_generation_service",
            "status": "unhealthy",
            "error": str(e)
        }

@app.post("/generate", response_model=SlideGenerationResponse)
async def generate_slides(
    request: SlideGenerationRequest,
    background_tasks: BackgroundTasks,
    http_request: Request
):
    """Generate a slide deck based on learning goals"""
    try:
        logger.info(f"Generating slides for: {request.learning_goal}")
        
        # Extract user ID from headers or use default
        user_id = http_request.headers.get("X-User-ID", "anonymous")
        request.user_id = user_id
        
        # If documents are provided, ensure they're processed
        if request.uploaded_documents:
            logger.info(f"Checking {len(request.uploaded_documents)} documents")
            for doc_id in request.uploaded_documents:
                try:
                    # This will wait for document processing if needed
                    doc_content = await get_document_content(doc_id, user_id)
                    logger.info(f"Document {doc_id} ready for use")
                except Exception as e:
                    logger.warning(f"Could not access document {doc_id}: {e}")
        
        # Generate the slide deck
        response = await slide_designer.generate_slide_deck(request)
        
        if response.status == "failed":
            raise HTTPException(
                status_code=500,
                detail=f"Slide generation failed: {', '.join(response.warnings)}"
            )
        
        # If deck was created, run speaker-note refinement and voice generation asynchronously so we can respond faster
        if response.deck:
            background_tasks.add_task(
                refine_and_voice,
                deck_id=response.deck.deck_id,
                slides=response.deck.slides,
            )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating slides: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate slides: {str(e)}")

@app.post("/regenerate/{deck_id}")
async def regenerate_slide(deck_id: str, slide_index: int):
    """Regenerate a specific slide in a deck"""
    try:
        # TODO: Implement slide regeneration
        # This would involve:
        # 1. Retrieving the deck from storage
        # 2. Using the agent to regenerate just that slide
        # 3. Updating the deck
        # 4. Returning the new slide
        
        return {
            "status": "not_implemented",
            "message": "Slide regeneration coming soon"
        }
        
    except Exception as e:
        logger.error(f"Error regenerating slide: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/adapt/{deck_id}")
async def adapt_deck(deck_id: str, feedback: dict):
    """Adapt the deck based on student feedback"""
    try:
        # TODO: Implement adaptive deck modification
        # This would involve:
        # 1. Analyzing the feedback
        # 2. Determining what changes are needed
        # 3. Using the agent to create/modify slides
        # 4. Returning the updated deck structure
        
        return {
            "status": "not_implemented",
            "message": "Adaptive deck modification coming soon"
        }
        
    except Exception as e:
        logger.error(f"Error adapting deck: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def schedule_voice_generation(deck_id: str, slides: list):
    """Schedule voice generation for slides (background task)"""
    try:
        logger.info(f"Scheduling voice generation for deck {deck_id} with {len(slides)} slides")
        
        # TODO: Call voice synthesis service
        # This would involve:
        # 1. Extracting speaker notes from each slide
        # 2. Calling the voice synthesis service API
        # 3. Storing the generated audio URLs with the deck
        
        # For now, just log
        for slide in slides:
            if slide.speaker_notes:
                logger.info(f"Would generate voice for slide {slide.id}: {slide.speaker_notes[:50]}...")
                
    except Exception as e:
        logger.error(f"Error in voice generation scheduling: {e}")

# ----------- Speaker-notes refinement ------------

async def refine_speaker_notes_with_gemini(slides: list):
    """For each slide, rewrite speaker_notes using Google's Gemini so they sound like a live lecture."""

    if not slides:
        return

    try:
        # Instantiate Gemini model via LLMProvider (fallback safe)
        gemini_llm = LLMProvider.get_llm(provider="google", model="gemini-2.0-flash", temperature=0.7)

        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are a charismatic professor. Given a slide's title and visible text, craft a 60-word narration that TEACHES the content. NEVER read the text verbatim; instead, explain it with examples, analogies, rhetorical questions. Use transitions like 'first', 'next', 'consider'. Return ONLY the narration."),
            ("human", "Slide Title: {title}\nVisible Text: {visible_text}")
        ])

        async def process_slide(slide):
            # Build visible text summary
            texts = []
            if slide.title:
                texts.append(slide.title)
            for c in slide.contents:
                if isinstance(c.value, str):
                    texts.append(c.value)
                elif isinstance(c.value, list):
                    texts.extend(c.value)
            visible_text = " ".join(texts)[:1200]

            messages = prompt_tmpl.format_messages(title=slide.title or "", visible_text=visible_text)

            try:
                narration_msg = await gemini_llm.ainvoke(messages)
                narration_text = narration_msg.content.strip()
            except Exception as ge:
                logger.warning(f"Gemini failed for slide {slide.id}: {ge}; falling back to OpenAI")
                from shared.config import get_settings
                fallback_llm = LLMProvider.get_llm(provider="openai", model=get_settings().openai_model, temperature=0.7)
                narration_msg = await fallback_llm.ainvoke(messages)
                if hasattr(narration_msg, "content"):
                    narration_text = narration_msg.content.strip()
                else:
                    narration_text = str(narration_msg).strip()

            # Update slide speaker_notes
            slide.speaker_notes = narration_text

        # Run slides serially or concurrently depending on size
        await asyncio.gather(*[process_slide(s) for s in slides])

        logger.info("Speaker notes refined with Gemini for all slides")

    except Exception as e:
        logger.error(f"Failed to refine speaker notes with Gemini: {e}")

# -------- Combined background pipeline -------

async def refine_and_voice(deck_id: str, slides: list):
    """Background task: refine speaker notes with Gemini then trigger voice generation."""
    try:
        await refine_speaker_notes_with_gemini(slides)
        await schedule_voice_generation(deck_id=deck_id, slides=slides)
    except Exception as e:
        logger.error(f"Background refine_and_voice failed: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005) 