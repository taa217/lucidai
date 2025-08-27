"""
Teaching Content Service - Bridge between Document Analysis and Frontend Teaching
Provides APIs for smart curriculum generation and whiteboard-ready teaching content
"""

import os
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel  
import uvicorn
from datetime import datetime
from contextlib import asynccontextmanager

# Import our custom modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from shared.content_analysis_agent import get_content_analysis_agent, DocumentStructure, TeachingModule
from shared.vector_db import get_vector_db, VectorDatabase
from shared.langchain_config import MultiAgentOrchestrator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models
class SmartCurriculumRequest(BaseModel):
    user_id: str
    learning_goals: str
    uploaded_documents: List[str] = []  # List of file IDs
    difficulty_level: str = "intermediate"
    learning_style: str = "balanced"
    session_duration: int = 60  # minutes

class WhiteboardContentRequest(BaseModel):
    curriculum_id: str
    module_index: int = 0
    user_id: str

class SmartCurriculum(BaseModel):
    curriculum_id: str
    user_id: str
    title: str
    learning_goals: str
    difficulty_level: str
    total_duration: int
    modules: List[Dict[str, Any]]
    document_sources: List[str]
    created_at: str

class WhiteboardSegment(BaseModel):
    id: str
    voice_text: str
    visual_content: str
    coordinates: Dict[str, float]
    duration_seconds: int
    visual_action: str

class TeachingSession(BaseModel):
    session_id: str
    curriculum_id: str
    module_index: int
    segments: List[WhiteboardSegment]
    estimated_duration: int
    learning_objectives: List[str]

# Global instances
content_agent = None
vector_db: VectorDatabase = None
orchestrator: MultiAgentOrchestrator = None
generated_curricula: Dict[str, SmartCurriculum] = {}
active_sessions: Dict[str, TeachingSession] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events"""
    # Startup
    global content_agent, vector_db, orchestrator
    
    try:
        # Initialize content analysis agent
        content_agent = get_content_analysis_agent()
        logger.info("Content analysis agent initialized")
        
        # Initialize vector database
        vector_db = await get_vector_db()
        logger.info("Vector database connected")
        
        # Initialize orchestrator for enhanced teaching
        orchestrator = MultiAgentOrchestrator()
        orchestrator.initialize_agents()
        logger.info("Teaching orchestrator initialized")
        
        logger.info("Teaching Content Service started successfully")
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Teaching Content Service")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Teaching Content Service",
    description="Smart curriculum generation and whiteboard content delivery service",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
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
        "service": "Teaching Content Service",
        "status": "healthy",
        "version": "1.0.0",
        "active_curricula": len(generated_curricula),
        "active_sessions": len(active_sessions),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        return {
            "service": "teaching_content_service",
            "status": "healthy",
            "components": {
                "content_agent": "healthy" if content_agent and content_agent.initialized else "unhealthy",
                "vector_db": "healthy" if vector_db else "unhealthy",
                "orchestrator": "healthy" if orchestrator else "unhealthy"
            },
            "stats": {
                "generated_curricula": len(generated_curricula),
                "active_sessions": len(active_sessions)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"service": "teaching_content_service", "status": "unhealthy", "error": str(e)}

@app.post("/curriculum/generate", response_model=SmartCurriculum)
async def generate_smart_curriculum(request: SmartCurriculumRequest, background_tasks: BackgroundTasks):
    """Generate intelligent curriculum from uploaded documents"""
    try:
        curriculum_id = f"curriculum_{request.user_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        # Start background processing for comprehensive analysis
        background_tasks.add_task(
            process_curriculum_generation,
            curriculum_id,
            request
        )
        
        # Return immediate response with basic curriculum structure
        basic_curriculum = SmartCurriculum(
            curriculum_id=curriculum_id,
            user_id=request.user_id,
            title=f"Learning Plan: {request.learning_goals}",
            learning_goals=request.learning_goals,
            difficulty_level=request.difficulty_level,
            total_duration=request.session_duration,
            modules=[
                {
                    "id": "module_1",
                    "title": "Introduction and Foundation",
                    "duration": request.session_duration // 3,
                    "status": "generating"
                },
                {
                    "id": "module_2", 
                    "title": "Core Concepts and Application",
                    "duration": request.session_duration // 2,
                    "status": "generating"
                },
                {
                    "id": "module_3",
                    "title": "Practice and Mastery",
                    "duration": request.session_duration // 6,
                    "status": "generating"
                }
            ],
            document_sources=request.uploaded_documents,
            created_at=datetime.utcnow().isoformat()
        )
        
        # Store basic curriculum
        generated_curricula[curriculum_id] = basic_curriculum
        
        logger.info(f"Started curriculum generation: {curriculum_id}")
        return basic_curriculum
        
    except Exception as e:
        logger.error(f"Curriculum generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Curriculum generation failed: {str(e)}")

async def process_curriculum_generation(curriculum_id: str, request: SmartCurriculumRequest):
    """Background task for comprehensive curriculum generation"""
    try:
        logger.info(f"Processing curriculum generation for {curriculum_id}")
        
        # Step 1: Retrieve and analyze document content more thoroughly
        document_content = []
        document_structures = []
        
        if request.uploaded_documents:
            for file_id in request.uploaded_documents:
                try:
                    # Search for document content with more comprehensive retrieval
                    search_results = await vector_db.similarity_search(
                        query=request.learning_goals,
                        collection_name=f"{request.user_id}_default",
                        top_k=25  # Increased from 10 to get more content
                    )
                    
                    if search_results:
                        # Get more comprehensive document content
                        full_content = '\n\n'.join([result['document'] for result in search_results])
                        
                        # Also try to get additional content with broader search
                        additional_search = await vector_db.similarity_search(
                            query=f"{request.learning_goals} examples applications practice problems theory",
                            collection_name=f"{request.user_id}_default",
                            top_k=15
                        )
                        
                        if additional_search:
                            additional_content = '\n\n'.join([result['document'] for result in additional_search])
                            full_content = f"{full_content}\n\n--- Additional Related Content ---\n\n{additional_content}"
                        
                        document_content.append({
                            'file_id': file_id,
                            'content': full_content,
                            'metadata': search_results[0].get('metadata', {}),
                            'total_chunks': len(search_results) + len(additional_search)
                        })
                        
                        # Analyze document structure with more content
                        structure = await content_agent.analyze_document_structure(
                            full_content[:10000],  # Use more content for analysis
                            search_results[0].get('metadata', {})
                        )
                        document_structures.append(structure)
                        
                except Exception as e:
                    logger.warning(f"Failed to process document {file_id}: {str(e)}")
        
        # Step 2: Generate comprehensive teaching modules using AI analysis
        all_modules = []
        
        if document_structures:
            # Use the most comprehensive document structure
            primary_structure = max(document_structures, key=lambda s: len(s.key_concepts))
            
            # Combine all document content for comprehensive teaching
            combined_content = '\n\n=== COMBINED DOCUMENT CONTENT ===\n\n'.join([
                f"Document {i+1}:\n{doc['content'][:8000]}" 
                for i, doc in enumerate(document_content)
            ])
            
            logger.info(f"Using {sum(doc['total_chunks'] for doc in document_content)} content chunks for curriculum generation")
            
            # Generate intelligent teaching modules with enhanced content
            teaching_modules = await content_agent.generate_teaching_modules(
                document_structure=primary_structure,
                learning_goals=request.learning_goals,
                user_learning_style=request.learning_style,
                session_duration=max(request.session_duration, 60)  # Minimum 60 minutes for comprehensive learning
            )
            
            # Convert to API format with enhanced details
            for module in teaching_modules:
                # Generate detailed whiteboard content for each module
                whiteboard_segments = await content_agent.extract_whiteboard_content(module)
                
                # Calculate actual teaching time based on segments
                actual_duration = sum(seg.get('duration_seconds', 30) for seg in whiteboard_segments) / 60
                
                module_data = {
                    "id": module.id,
                    "title": module.title,
                    "content": module.content,
                    "visual_elements": module.visual_elements,
                    "duration": max(module.duration_minutes, actual_duration, 15),  # Ensure minimum 15 minutes
                    "difficulty": module.difficulty,
                    "learning_outcomes": module.learning_outcomes,
                    "teaching_strategies": module.teaching_strategies,
                    "assessment_questions": module.assessment_questions,
                    "whiteboard_segments": len(whiteboard_segments),  # Track segment count
                    "content_depth": "comprehensive" if len(module.content) > 400 else "standard",
                    "status": "ready"
                }
                all_modules.append(module_data)
            
            # Ensure we have enough modules for comprehensive learning
            if len(all_modules) < 4:
                logger.info(f"Only {len(all_modules)} modules generated. Creating supplementary modules...")
                
                # Add practice and review modules
                supplementary_modules = [
                    {
                        "id": f"module_{len(all_modules)+1}",
                        "title": "Guided Practice and Problem Solving",
                        "content": f"This module focuses on applying the concepts learned about {request.learning_goals} through hands-on practice. We'll work through progressively challenging problems, starting with basic applications and building to complex scenarios. Each problem is designed to reinforce key concepts while developing problem-solving skills.",
                        "visual_elements": ["Practice problem frameworks", "Solution strategies", "Common patterns", "Worked examples"],
                        "duration": 20,
                        "difficulty": "intermediate",
                        "learning_outcomes": ["Apply learned concepts to solve problems", "Recognize problem patterns", "Develop systematic problem-solving approach"],
                        "teaching_strategies": ["Guided problem-solving", "Think-aloud demonstrations", "Error analysis", "Progressive difficulty"],
                        "assessment_questions": ["Solve a similar problem independently", "Explain your problem-solving approach", "Identify the key concept used in each solution"],
                        "whiteboard_segments": 8,
                        "content_depth": "comprehensive",
                        "status": "ready"
                    },
                    {
                        "id": f"module_{len(all_modules)+2}",
                        "title": "Synthesis and Advanced Applications",
                        "content": f"In this final module, we'll synthesize everything learned about {request.learning_goals} and explore advanced applications. We'll see how these concepts connect to broader topics and real-world scenarios. This module prepares you for independent learning and application of these principles.",
                        "visual_elements": ["Concept map", "Advanced formulas", "Real-world case studies", "Future learning paths"],
                        "duration": 15,
                        "difficulty": primary_structure.difficulty_level,
                        "learning_outcomes": ["Synthesize multiple concepts", "Apply knowledge to novel situations", "Identify areas for further study"],
                        "teaching_strategies": ["Conceptual integration", "Case study analysis", "Self-assessment", "Future learning guidance"],
                        "assessment_questions": ["Create a concept map of what you've learned", "Propose a real-world application", "Self-assess your understanding level"],
                        "whiteboard_segments": 6,
                        "content_depth": "comprehensive",
                        "status": "ready"
                    }
                ]
                
                all_modules.extend(supplementary_modules[:4-len(all_modules)])  # Add only what's needed
        
        # Step 3: Create comprehensive curriculum with quality metrics
        total_duration = sum(module['duration'] for module in all_modules)
        total_segments = sum(module.get('whiteboard_segments', 5) for module in all_modules)
        
        enhanced_curriculum = SmartCurriculum(
            curriculum_id=curriculum_id,
            user_id=request.user_id,
            title=document_structures[0].title if document_structures else f"Comprehensive Learning Plan: {request.learning_goals}",
            learning_goals=request.learning_goals,
            difficulty_level=document_structures[0].difficulty_level if document_structures else request.difficulty_level,
            total_duration=total_duration,
            modules=all_modules if all_modules else generated_curricula[curriculum_id].modules,
            document_sources=request.uploaded_documents,
            created_at=datetime.utcnow().isoformat()
        )
        
        # Update stored curriculum
        generated_curricula[curriculum_id] = enhanced_curriculum
        
        logger.info(f"✅ Completed comprehensive curriculum generation: {curriculum_id}")
        logger.info(f"   - {len(all_modules)} modules")
        logger.info(f"   - {total_duration} minutes total duration")
        logger.info(f"   - {total_segments} teaching segments")
        logger.info(f"   - {sum(doc['total_chunks'] for doc in document_content)} content chunks used")
        
    except Exception as e:
        logger.error(f"Background curriculum generation failed: {str(e)}")
        # Keep the basic curriculum structure but mark as needing attention
        if curriculum_id in generated_curricula:
            for module in generated_curricula[curriculum_id].modules:
                module['status'] = 'generation_failed'
                module['error'] = str(e)

@app.get("/curriculum/{curriculum_id}", response_model=SmartCurriculum)
async def get_curriculum(curriculum_id: str):
    """Get curriculum by ID"""
    if curriculum_id not in generated_curricula:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    
    return generated_curricula[curriculum_id]

@app.post("/whiteboard/content", response_model=TeachingSession)
async def get_whiteboard_content(request: WhiteboardContentRequest):
    """Get whiteboard-ready teaching content for a specific module"""
    try:
        # Get curriculum
        if request.curriculum_id not in generated_curricula:
            raise HTTPException(status_code=404, detail="Curriculum not found")
        
        curriculum = generated_curricula[request.curriculum_id]
        
        # Get specific module
        if request.module_index >= len(curriculum.modules):
            raise HTTPException(status_code=404, detail="Module not found")
        
        module_data = curriculum.modules[request.module_index]
        
        # Create TeachingModule object for content extraction
        teaching_module = TeachingModule(
            id=module_data['id'],
            title=module_data['title'],
            content=module_data.get('content', ''),
            visual_elements=module_data.get('visual_elements', []),
            duration_minutes=module_data.get('duration', 15),
            difficulty=module_data.get('difficulty', 'intermediate'),
            prerequisites=[],
            learning_outcomes=module_data.get('learning_outcomes', []),
            teaching_strategies=module_data.get('teaching_strategies', []),
            assessment_questions=module_data.get('assessment_questions', [])
        )
        
        # Extract whiteboard content using AI
        whiteboard_segments_data = await content_agent.extract_whiteboard_content(teaching_module)
        
        # Convert to API models
        whiteboard_segments = []
        for segment_data in whiteboard_segments_data:
            segment = WhiteboardSegment(
                id=segment_data.get('id', f'segment_{len(whiteboard_segments)+1}'),
                voice_text=segment_data.get('voice_text', ''),
                visual_content=segment_data.get('visual_content', ''),
                coordinates=segment_data.get('coordinates', {'x': 50, 'y': 50}),
                duration_seconds=segment_data.get('duration_seconds', 4),
                visual_action=segment_data.get('visual_action', 'write')
            )
            whiteboard_segments.append(segment)
        
        # Create teaching session
        session_id = f"session_{request.curriculum_id}_{request.module_index}_{datetime.utcnow().strftime('%H%M%S')}"
        
        teaching_session = TeachingSession(
            session_id=session_id,
            curriculum_id=request.curriculum_id,
            module_index=request.module_index,
            segments=whiteboard_segments,
            estimated_duration=sum(seg.duration_seconds for seg in whiteboard_segments),
            learning_objectives=teaching_module.learning_outcomes
        )
        
        # Store session
        active_sessions[session_id] = teaching_session
        
        logger.info(f"Generated whiteboard content for {request.curriculum_id}, module {request.module_index}")
        return teaching_session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Whiteboard content generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

@app.get("/curriculum/user/{user_id}")
async def get_user_curricula(user_id: str):
    """Get all curricula for a user"""
    user_curricula = [
        curriculum for curriculum in generated_curricula.values() 
        if curriculum.user_id == user_id
    ]
    
    return {
        "user_id": user_id,
        "curricula": user_curricula,
        "total_count": len(user_curricula)
    }

@app.get("/sessions/{session_id}", response_model=TeachingSession)
async def get_teaching_session(session_id: str):
    """Get teaching session by ID"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Teaching session not found")
    
    return active_sessions[session_id]

@app.delete("/curriculum/{curriculum_id}")
async def delete_curriculum(curriculum_id: str):
    """Delete curriculum and associated sessions"""
    if curriculum_id not in generated_curricula:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    
    # Remove curriculum
    del generated_curricula[curriculum_id]
    
    # Remove associated sessions
    sessions_to_remove = [
        session_id for session_id, session in active_sessions.items()
        if session.curriculum_id == curriculum_id
    ]
    
    for session_id in sessions_to_remove:
        del active_sessions[session_id]
    
    return {"message": f"Curriculum {curriculum_id} deleted successfully"}

@app.get("/analytics/teaching")
async def get_teaching_analytics():
    """Get teaching analytics and usage statistics"""
    return {
        "total_curricula": len(generated_curricula),
        "total_sessions": len(active_sessions),
        "curricula_by_status": {
            "ready": len([c for c in generated_curricula.values() if all(m.get('status') == 'ready' for m in c.modules)]),
            "generating": len([c for c in generated_curricula.values() if any(m.get('status') == 'generating' for m in c.modules)])
        },
        "avg_curriculum_duration": sum(c.total_duration for c in generated_curricula.values()) / max(1, len(generated_curricula)),
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    # Load environment variables
    port = int(os.getenv("TEACHING_CONTENT_PORT", "8004"))
    host = os.getenv("TEACHING_CONTENT_HOST", "0.0.0.0")
    
    logger.info(f"Starting Teaching Content Service on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    ) 