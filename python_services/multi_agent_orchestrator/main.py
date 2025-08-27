"""
Multi-Agent Orchestrator Service - LangChain-powered Teaching Coordination
Manages specialized teaching agents and RAG-enhanced document retrieval
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
import asyncio

# Import our custom modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from shared.langchain_config import (
    MultiAgentOrchestrator, 
    TeachingContext, 
    create_teaching_context,
    AgentConfiguration,
    get_document_content,
)
from shared.vector_db import get_vector_db, VectorDatabase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
orchestrator: MultiAgentOrchestrator = None
vector_db: VectorDatabase = None
active_sessions: Dict[str, TeachingContext] = {}
generated_lesson_plans: Dict[str, Any] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events"""
    # Startup
    global orchestrator, vector_db
    
    try:
        # Initialize vector database
        vector_db = await get_vector_db()
        logger.info("Vector database connected")
        
        # Initialize multi-agent orchestrator
        orchestrator = MultiAgentOrchestrator()
        orchestrator.initialize_agents()
        logger.info("Multi-agent orchestrator initialized")
        
        logger.info("Multi-Agent Teaching Orchestrator started successfully")
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Multi-Agent Teaching Orchestrator")

# Pydantic models
class TeachingRequest(BaseModel):
    user_id: str
    user_input: str
    learning_goals: Optional[str] = None
    session_id: Optional[str] = None

class LessonPlanRequest(BaseModel):
    user_id: str
    learning_goals: str
    uploaded_documents: List[str] = []  # List of file IDs
    difficulty_level: str = "intermediate"
    learning_style: str = "balanced"

class TeachingResponse(BaseModel):
    response: str
    agent_type: str
    session_id: str
    context_summary: Dict[str, Any]
    suggested_actions: List[str] = []

class LessonPlan(BaseModel):
    plan_id: str
    user_id: str
    learning_goals: str
    modules: List[Dict[str, Any]]
    estimated_duration: int  # minutes
    difficulty_level: str
    created_at: str

class AgentStatus(BaseModel):
    agent_type: str
    status: str
    model: str
    provider: str
    last_used: Optional[str] = None

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Multi-Agent Teaching Orchestrator",
    description="LangChain-powered multi-agent system for personalized AI teaching",
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
        "service": "Multi-Agent Teaching Orchestrator",
        "status": "healthy",
        "version": "1.0.0",
        "active_sessions": len(active_sessions),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        agent_status = {}
        
        if orchestrator:
            for agent_type in AgentConfiguration.AGENT_CONFIGS.keys():
                try:
                    agent = orchestrator.get_agent(agent_type)
                    agent_status[agent_type] = {
                        "status": "healthy" if agent['initialized'] else "unhealthy",
                        "provider": agent['config']['provider'],
                        "model": agent['config']['model']
                    }
                except:
                    agent_status[agent_type] = {"status": "error"}
        
        return {
            "service": "multi_agent_orchestrator",
            "status": "healthy",
            "agents": agent_status,
            "active_sessions": len(active_sessions),
            "vector_db_status": "healthy" if vector_db else "unhealthy",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"service": "multi_agent_orchestrator", "status": "unhealthy", "error": str(e)}

@app.get("/agents", response_model=List[AgentStatus])
async def list_agents():
    """List all available teaching agents"""
    try:
        agents = []
        
        for agent_type, config in AgentConfiguration.AGENT_CONFIGS.items():
            agent_info = AgentStatus(
                agent_type=agent_type,
                status="active" if orchestrator and agent_type in orchestrator.agents else "inactive",
                model=config['model'],
                provider=config['provider']
            )
            agents.append(agent_info)
        
        return agents
        
    except Exception as e:
        logger.error(f"Error listing agents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list agents: {str(e)}")

@app.post("/teach", response_model=TeachingResponse)
async def teach_student(request: TeachingRequest):
    """Main teaching endpoint - coordinate agents to respond to student"""
    try:
        session_id = request.session_id or f"session_{request.user_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        # Get or create teaching context
        if session_id not in active_sessions:
            # Create new teaching context
            context = create_teaching_context(
                user_id=request.user_id,
                learning_goals=request.learning_goals or "General learning",
                documents=[]  # Would load from user's uploaded documents
            )
            active_sessions[session_id] = context
            orchestrator.set_context(context)
        else:
            context = active_sessions[session_id]
            orchestrator.set_context(context)
        
        # Check if we need to retrieve relevant documents
        relevant_docs = []
        if request.user_input:
            try:
                # Search for relevant content from user's uploaded documents
                search_results = await vector_db.similarity_search(
                    query=request.user_input,
                    collection_name=f"{request.user_id}_default",
                    top_k=3
                )
                relevant_docs = search_results
            except Exception as e:
                logger.warning(f"Document search failed: {str(e)}")
        
        # Enhance user input with retrieved documents
        enhanced_input = request.user_input
        if relevant_docs:
            doc_context = "\n\nRelevant content from uploaded materials:\n"
            for i, doc in enumerate(relevant_docs, 1):
                doc_context += f"{i}. {doc['document'][:200]}...\n"
            enhanced_input = request.user_input + doc_context
        
        # Get coordinated response from agents
        teaching_result = await orchestrator.coordinate_teaching(enhanced_input)
        
        # Generate suggested actions
        suggested_actions = [
            "Ask a follow-up question",
            "Request more examples",
            "Move to next topic",
            "Review previous concepts"
        ]
        
        response = TeachingResponse(
            response=teaching_result['response'],
            agent_type=teaching_result['agent'],
            session_id=session_id,
            context_summary=teaching_result['context'],
            suggested_actions=suggested_actions
        )
        
        logger.info(f"Teaching response generated for user {request.user_id}")
        return response
        
    except Exception as e:
        logger.error(f"Teaching error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Teaching failed: {str(e)}")

@app.post("/lesson-plan", response_model=LessonPlan)
async def generate_lesson_plan(request: LessonPlanRequest):
    """Generates a personalized lesson plan for the user"""
    try:
        logger.info(f"Received lesson plan request for user {request.user_id}")

        # Step 1: Concurrently fetch content for all uploaded documents
        document_contents = await asyncio.gather(
            *[get_document_content(doc_id, request.user_id) for doc_id in request.uploaded_documents]
        )
        
        full_text_list = [doc['content'] for doc in document_contents if doc and doc.get('content')]
        
        if not full_text_list:
            raise HTTPException(status_code=400, detail="Could not retrieve content from any of the provided documents.")
            
        combined_text = "\\n\\n---\\n\\n".join(full_text_list)
        
        # Step 2: Generate the lesson plan using the orchestrator
        plan_id = f"plan_{request.user_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        generated_plan_dict = await orchestrator.generate_lesson_plan(
            learning_goals=request.learning_goals,
            document_content=combined_text,
            difficulty_level=request.difficulty_level,
            user_id=request.user_id,
            plan_id=plan_id
        )

        # Convert the dictionary back to the Pydantic model for the response
        response_plan = LessonPlan(**generated_plan_dict)

        # 🔥 CRITICAL FIX: Store the lesson plan so whiteboard endpoint can find it
        generated_lesson_plans[response_plan.plan_id] = response_plan
        
        logger.info(f"✅ Lesson plan {response_plan.plan_id} generated and stored for user {request.user_id}")
        logger.info(f"📚 Total stored lesson plans: {len(generated_lesson_plans)}")
        return response_plan

    except HTTPException as he:
        logger.error(f"HTTP Exception in lesson plan generation: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Lesson plan generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate lesson plan: {str(e)}")

@app.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get information about an active teaching session"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    context = active_sessions[session_id]
    return context.get_context_summary()

@app.delete("/sessions/{session_id}")
async def end_session(session_id: str):
    """End an active teaching session"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    del active_sessions[session_id]
    return {"message": f"Session {session_id} ended successfully"}

@app.get("/lesson-plans/{user_id}")
async def get_user_lesson_plans(user_id: str):
    """Get all lesson plans for a user"""
    user_plans = [
        plan for plan in generated_lesson_plans.values() 
        if plan.user_id == user_id
    ]
    
    return {
        "user_id": user_id,
        "lesson_plans": user_plans,
        "total_count": len(user_plans)
    }

@app.post("/agents/{agent_type}/query")
async def query_specific_agent(agent_type: str, query: str):
    """Query a specific agent directly"""
    try:
        if agent_type not in AgentConfiguration.AGENT_CONFIGS:
            raise HTTPException(status_code=404, detail=f"Agent type {agent_type} not found")
        
        response = await orchestrator._get_agent_response(
            agent_type=agent_type,
            prompt=query,
            include_context=False
        )
        
        return {
            "agent_type": agent_type,
            "query": query,
            "response": response,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Agent query error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Agent query failed: {str(e)}")

@app.get("/whiteboard/{plan_id}/{module_index}")
async def get_whiteboard_teaching_content(plan_id: str, module_index: int):
    """🎨 Generate AI-powered whiteboard teaching content for a specific lesson plan module"""
    try:
        # Debug logging to help track the issue
        logger.info(f"🔍 Whiteboard request for plan_id: {plan_id}, module_index: {module_index}")
        logger.info(f"📚 Available lesson plans: {list(generated_lesson_plans.keys())}")
        logger.info(f"📊 Total lesson plans stored: {len(generated_lesson_plans)}")
        
        # Check if lesson plan exists
        if plan_id not in generated_lesson_plans:
            logger.error(f"❌ Lesson plan {plan_id} not found in storage")
            raise HTTPException(status_code=404, detail=f"Lesson plan {plan_id} not found")
        
        lesson_plan = generated_lesson_plans[plan_id]
        logger.info(f"✅ Found lesson plan: {lesson_plan.plan_id} with {len(lesson_plan.modules)} modules")
        
        # Check if module exists
        if module_index >= len(lesson_plan.modules):
            logger.error(f"❌ Module {module_index} not found, only {len(lesson_plan.modules)} modules available")
            raise HTTPException(status_code=404, detail="Module not found")
        
        module = lesson_plan.modules[module_index]
        module_title = module.get('title', f'Module {module_index + 1}')
        module_content = module.get('description', module.get('content', ''))
        
        logger.info(f"🎨 Generating AI whiteboard content for: {module_title}")
            
        # Use AI to generate intelligent teaching segments
        try:
            ai_segments = await orchestrator.generate_teaching_segments(
                lesson_content=module_content,
                module_title=module_title,
                user_id=lesson_plan.user_id
            )
            
            # Convert to the expected format for the frontend
            formatted_segments = []
            for segment in ai_segments:
                formatted_segments.append({
                    "id": segment["id"],
                    "voice_text": segment["voice_text"],
                    "visual_content": segment["visual_content"],
                    "coordinates": segment["coordinates"],
                    "duration_seconds": segment["duration_seconds"],
                    "visual_action": "write",
                    "teaching_notes": segment.get("teaching_notes", "")
                })
            
            total_duration = sum(seg['duration_seconds'] for seg in formatted_segments)
            
            return {
                "plan_id": plan_id,
                "module_index": module_index,
                "module_title": module_title,
                "segments": formatted_segments,
                "session_id": f"ai_session_{plan_id}_{module_index}",
                "estimated_duration": total_duration,
                "learning_objectives": [f"Master the concepts of {module_title}"],
                "enhanced": True,
                "ai_generated": True
            }
        
        except Exception as ai_error:
            logger.warning(f"AI segment generation failed: {ai_error}, using fallback")
            # Fallback: Generate basic segments
            fallback_segments = [
                {
                    "id": "intro",
                    "voice_text": f"Welcome to {module_title}. Let's explore these concepts from your uploaded documents.",
                    "visual_content": module_title,
                    "coordinates": {"x": 50, "y": 20},
                    "duration_seconds": 4,
                    "visual_action": "write"
                },
                {
                    "id": "overview",
                    "voice_text": "We'll cover the key points that will help you understand this topic thoroughly.",
                    "visual_content": "Key Learning Points",
                    "coordinates": {"x": 50, "y": 35},
                    "duration_seconds": 5,
                    "visual_action": "write"
                },
                {
                    "id": "content",
                    "voice_text": f"Let's dive into the main concepts. {module_content[:100]}...",
                    "visual_content": "Core Concepts",
                    "coordinates": {"x": 50, "y": 50},
                    "duration_seconds": 6,
                    "visual_action": "write"
                },
                {
                    "id": "summary",
                    "voice_text": f"That covers {module_title}. You now have a solid understanding of these important concepts.",
                    "visual_content": f"✓ {module_title} Complete",
                    "coordinates": {"x": 50, "y": 80},
                    "duration_seconds": 4,
                    "visual_action": "highlight"
                }
            ]
            
            return {
                "plan_id": plan_id,
                "module_index": module_index,
                "module_title": module_title,
                "segments": fallback_segments,
                "session_id": f"fallback_session_{plan_id}_{module_index}",
                "estimated_duration": sum(seg['duration_seconds'] for seg in fallback_segments),
                "learning_objectives": [f"Understand {module_title}"],
                "enhanced": False,
                "ai_generated": False
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Whiteboard content generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

@app.get("/analytics/usage")
async def get_usage_analytics():
    """Get usage analytics for the orchestrator"""
    return {
        "total_sessions": len(active_sessions),
        "total_lesson_plans": len(generated_lesson_plans),
        "agents_status": {
            agent_type: "active" if orchestrator and agent_type in orchestrator.agents else "inactive"
            for agent_type in AgentConfiguration.AGENT_CONFIGS.keys()
        },
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    # Load environment variables
    port = int(os.getenv("ORCHESTRATOR_PORT", "8003"))
    host = os.getenv("ORCHESTRATOR_HOST", "0.0.0.0")
    
    logger.info(f"Starting Multi-Agent Teaching Orchestrator on {host}:{port}")
    
    # Determine the correct module path
    import __main__
    module_path = __main__.__file__
    
    if module_path and 'multi_agent_orchestrator' in module_path:
        # Running as module: python -m multi_agent_orchestrator.main
        app_string = "multi_agent_orchestrator.main:app"
    else:
        # Running directly: python main.py
        app_string = "main:app"
    
    uvicorn.run(
        app_string,
        host=host,
        port=port,
        reload=True,
        log_level="info"
    ) 