"""
Mathematics Teaching Service - Specialized AI Math Tutor
Provides step-by-step math instruction with visual whiteboard content and voice explanations
"""

import os
import logging
from typing import List, Dict, Any, Optional, Tuple
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from datetime import datetime
from contextlib import asynccontextmanager
import asyncio
import json
import re

# Import our custom modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from shared.langchain_config import LLMProvider, MultiAgentOrchestrator
from shared.llm_client import get_llm_client, UnifiedLLMClient
from shared.models import ConversationMessage, MessageRole, LLMProvider as Provider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
llm_client: UnifiedLLMClient = None
math_agents: Dict[str, Any] = {}

class MathTopic(BaseModel):
    id: str
    name: str
    description: str
    difficulty_level: str  # "fundamentals", "basic", "intermediate", "advanced"
    prerequisites: List[str] = []
    subtopics: List[str] = []

class MathProblem(BaseModel):
    id: str
    topic: str
    question: str
    difficulty: str
    solution_steps: List[str] = []
    visual_elements: List[Dict[str, Any]] = []

class TeachingStep(BaseModel):
    id: str
    step_number: int
    explanation: str
    visual_content: str
    math_expression: Optional[str] = None
    voice_text: str
    duration_seconds: float
    coordinates: Dict[str, float]
    step_type: str  # "concept", "example", "practice", "review"

class MathLessonRequest(BaseModel):
    topic: str
    user_level: str = "fundamentals"  # Start from fundamentals
    learning_goals: List[str] = []
    preferred_pace: str = "moderate"  # "slow", "moderate", "fast"

class MathQuestionRequest(BaseModel):
    topic: str
    question: str
    user_level: str
    show_work: bool = True

class MathLessonPlan(BaseModel):
    lesson_id: str
    topic: str
    title: str
    description: str
    difficulty_level: str
    estimated_duration: int  # minutes
    prerequisites_covered: List[str]
    teaching_steps: List[TeachingStep]
    practice_problems: List[MathProblem]
    created_at: str

# Math curriculum definitions - fundamentals first approach
MATH_CURRICULUM = {
    "arithmetic": {
        "name": "Arithmetic Fundamentals",
        "description": "Basic number operations, fractions, decimals, and percentages",
        "levels": ["fundamentals", "basic", "intermediate"],
        "subtopics": [
            "counting_and_numbers",
            "addition_subtraction", 
            "multiplication_division",
            "fractions_basics",
            "decimals_basics",
            "percentages"
        ]
    },
    "algebra": {
        "name": "Algebra",
        "description": "Variables, equations, and algebraic manipulation",
        "levels": ["basic", "intermediate", "advanced"],
        "prerequisites": ["arithmetic"],
        "subtopics": [
            "variables_and_expressions",
            "linear_equations",
            "quadratic_equations",
            "systems_of_equations",
            "polynomials",
            "factoring"
        ]
    },
    "geometry": {
        "name": "Geometry", 
        "description": "Shapes, areas, volumes, and spatial reasoning",
        "levels": ["basic", "intermediate", "advanced"],
        "prerequisites": ["arithmetic"],
        "subtopics": [
            "basic_shapes",
            "area_and_perimeter",
            "triangles_and_angles",
            "circles",
            "volume_and_surface_area",
            "coordinate_geometry"
        ]
    },
    "trigonometry": {
        "name": "Trigonometry",
        "description": "Angles, triangles, and trigonometric functions",
        "levels": ["intermediate", "advanced"],
        "prerequisites": ["algebra", "geometry"],
        "subtopics": [
            "angles_and_radians",
            "right_triangle_trig",
            "unit_circle",
            "trig_functions",
            "trig_identities",
            "trig_equations"
        ]
    },
    "calculus": {
        "name": "Calculus",
        "description": "Limits, derivatives, and integrals",
        "levels": ["advanced"],
        "prerequisites": ["algebra", "trigonometry"],
        "subtopics": [
            "limits",
            "derivatives_basics",
            "differentiation_rules",
            "applications_of_derivatives",
            "integrals_basics",
            "integration_techniques"
        ]
    }
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    global llm_client, math_agents
    
    try:
        # Initialize LLM client
        llm_client = get_llm_client()
        logger.info("LLM client initialized")
        
        # Initialize specialized math agents
        await initialize_math_agents()
        logger.info("Math teaching agents initialized")
        
        logger.info("Mathematics Teaching Service started successfully")
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    
    yield
    
    logger.info("Shutting down Mathematics Teaching Service")

async def initialize_math_agents():
    """Initialize specialized math teaching agents"""
    global math_agents
    
    math_agents = {
        "fundamentals_teacher": {
            "name": "Fundamentals Teacher",
            "role": "Teaches basic mathematical concepts from the ground up",
            "system_prompt": """You are a patient, encouraging mathematics teacher who specializes in fundamental concepts.
            
            Your teaching approach:
            - NEVER assume prior knowledge - always start from the very basics
            - Break down every concept into the smallest possible steps
            - Use simple, clear language that anyone can understand
            - Provide visual explanations that can be drawn on a whiteboard
            - Give lots of encouragement and positive reinforcement
            - Check understanding at each step before moving forward
            - Use real-world examples and analogies
            
            When explaining math concepts:
            1. Start with the absolute basics (what numbers are, what operations mean)
            2. Build up slowly, one small step at a time
            3. Repeat key concepts in different ways
            4. Always explain WHY something works, not just HOW
            5. Use visual representations whenever possible
            
            Format your responses as teaching steps that can be displayed on a whiteboard with voice narration."""
        },
        "problem_solver": {
            "name": "Problem Solver",
            "role": "Provides step-by-step solutions to math problems",
            "system_prompt": """You are a methodical math problem solver who shows every single step.
            
            Your problem-solving approach:
            - Show EVERY step, no matter how small or obvious it might seem
            - Explain the reasoning behind each step
            - Use proper mathematical notation
            - Identify what mathematical principles are being applied
            - Check your work at the end
            - Provide alternative methods when applicable
            
            When solving problems:
            1. Identify what type of problem it is
            2. List what information is given
            3. Identify what we need to find
            4. Choose the appropriate method/formula
            5. Work through each step with explanations
            6. Verify the answer makes sense
            
            Format as whiteboard-friendly steps with clear visual elements."""
        },
        "concept_builder": {
            "name": "Concept Builder", 
            "role": "Builds understanding of mathematical concepts progressively",
            "system_prompt": """You are a concept-focused math teacher who builds deep understanding.
            
            Your concept-building approach:
            - Focus on WHY mathematical concepts work, not just memorizing procedures
            - Build connections between different mathematical ideas
            - Use multiple representations (visual, numerical, algebraic)
            - Start with concrete examples before moving to abstract concepts
            - Help students see patterns and relationships
            
            When building concepts:
            1. Start with familiar, concrete examples
            2. Gradually introduce mathematical terminology
            3. Show the same concept in different ways
            4. Help students discover patterns
            5. Connect to previously learned concepts
            6. Provide plenty of practice opportunities
            
            Create learning experiences that develop mathematical intuition."""
        }
    }

app = FastAPI(
    title="Mathematics Teaching Service",
    description="Specialized AI mathematics tutor with step-by-step visual instruction",
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
        "service": "Mathematics Teaching Service",
        "status": "healthy",
        "version": "1.0.0",
        "available_topics": list(MATH_CURRICULUM.keys()),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        available_providers = llm_client.get_available_providers() if llm_client else []
        
        return {
            "service": "math_teaching_service",
            "status": "healthy",
            "agents": {name: "active" for name in math_agents.keys()},
            "llm_providers": [provider.value for provider in available_providers],
            "math_topics": len(MATH_CURRICULUM),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"service": "math_teaching_service", "status": "unhealthy", "error": str(e)}

@app.get("/topics", response_model=List[MathTopic])
async def list_math_topics():
    """List all available math topics with prerequisites"""
    topics = []
    
    for topic_id, topic_data in MATH_CURRICULUM.items():
        topic = MathTopic(
            id=topic_id,
            name=topic_data["name"],
            description=topic_data["description"],
            difficulty_level=topic_data["levels"][0],  # Starting level
            prerequisites=topic_data.get("prerequisites", []),
            subtopics=topic_data["subtopics"]
        )
        topics.append(topic)
    
    return topics

@app.post("/lesson", response_model=MathLessonPlan)
async def generate_math_lesson(request: MathLessonRequest):
    """Generate a comprehensive math lesson with step-by-step whiteboard teaching"""
    try:
        logger.info(f"Generating math lesson for topic: {request.topic}")
        
        # Validate topic
        if request.topic not in MATH_CURRICULUM:
            raise HTTPException(status_code=400, detail=f"Unknown topic: {request.topic}")
        
        topic_info = MATH_CURRICULUM[request.topic]
        
        # Check prerequisites if not starting from fundamentals
        if request.user_level != "fundamentals":
            missing_prereqs = await check_prerequisites(request.topic, request.user_level)
            if missing_prereqs:
                # Generate lesson covering prerequisites first
                logger.info(f"Adding prerequisite coverage: {missing_prereqs}")
        
        # Generate teaching steps using AI
        teaching_steps = await generate_teaching_steps(
            topic=request.topic,
            topic_info=topic_info,
            user_level=request.user_level,
            learning_goals=request.learning_goals,
            pace=request.preferred_pace
        )
        
        # Generate practice problems
        practice_problems = await generate_practice_problems(
            topic=request.topic,
            user_level=request.user_level,
            num_problems=3
        )
        
        lesson_id = f"lesson_{request.topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        lesson_plan = MathLessonPlan(
            lesson_id=lesson_id,
            topic=request.topic,
            title=f"{topic_info['name']} - {request.user_level.title()} Level",
            description=f"Comprehensive {topic_info['name']} lesson starting from fundamentals",
            difficulty_level=request.user_level,
            estimated_duration=len(teaching_steps) * 2,  # 2 minutes per step average
            prerequisites_covered=topic_info.get("prerequisites", []),
            teaching_steps=teaching_steps,
            practice_problems=practice_problems,
            created_at=datetime.utcnow().isoformat()
        )
        
        logger.info(f"Generated lesson with {len(teaching_steps)} teaching steps")
        return lesson_plan
        
    except Exception as e:
        logger.error(f"Error generating math lesson: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate lesson: {str(e)}")

@app.post("/explain")
async def explain_math_concept(request: MathQuestionRequest):
    """Provide detailed explanation of a specific math concept or problem"""
    try:
        logger.info(f"Explaining math concept: {request.question}")
        
        # Use appropriate agent based on question type
        agent_type = determine_agent_type(request.question)
        
        # Generate explanation using AI
        explanation_steps = await generate_explanation_steps(
            question=request.question,
            topic=request.topic,
            user_level=request.user_level,
            agent_type=agent_type,
            show_work=request.show_work
        )
        
        return {
            "question": request.question,
            "topic": request.topic,
            "explanation_steps": explanation_steps,
            "agent_used": agent_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error explaining concept: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to explain concept: {str(e)}")

async def check_prerequisites(topic: str, user_level: str) -> List[str]:
    """Check if user has necessary prerequisites for the topic"""
    topic_info = MATH_CURRICULUM.get(topic, {})
    prerequisites = topic_info.get("prerequisites", [])
    
    # For now, assume prerequisites need to be covered if user_level is "fundamentals"
    # In a real implementation, this would check user's actual knowledge
    if user_level == "fundamentals":
        return prerequisites
    
    return []

async def generate_teaching_steps(
    topic: str, 
    topic_info: Dict[str, Any], 
    user_level: str, 
    learning_goals: List[str], 
    pace: str
) -> List[TeachingStep]:
    """Generate step-by-step teaching content using AI"""
    
    # Create comprehensive prompt for the fundamentals teacher
    prompt = f"""Create a comprehensive mathematics lesson for {topic_info['name']}.

Student Level: {user_level} (START FROM ABSOLUTE BASICS)
Learning Goals: {', '.join(learning_goals) if learning_goals else 'Build strong fundamental understanding'}
Teaching Pace: {pace}

Requirements:
1. Assume NO prior knowledge - explain everything from the ground up
2. Break down into 8-12 small, digestible steps
3. Each step should be something that can be written/drawn on a whiteboard
4. Include what the teacher should SAY (voice_text) and what should appear VISUALLY
5. Start with the most basic concepts and build up gradually
6. Use simple, encouraging language
7. Include real-world examples where appropriate

For each step, provide:
- step_number: Sequential number (1, 2, 3...)
- explanation: Brief description of what this step teaches
- visual_content: What should be written/drawn on the whiteboard (use simple notation)
- voice_text: Exact words the AI teacher should speak (encouraging, patient tone)
- duration_seconds: How long this step should take (15-45 seconds)
- step_type: "concept", "example", "practice", or "review"

Topic Details: {topic_info['description']}
Subtopics to cover: {', '.join(topic_info['subtopics'])}

Generate a complete lesson that builds understanding step by step."""

    try:
        # Use fundamentals teacher agent
        messages = [
            ConversationMessage(role=MessageRole.SYSTEM, content=math_agents["fundamentals_teacher"]["system_prompt"]),
            ConversationMessage(role=MessageRole.USER, content=prompt)
        ]
        
        response, provider_used = await llm_client.generate_response(
            messages=messages,
            preferred_provider=Provider.ANTHROPIC,  # Anthropic is excellent for educational content
            max_tokens=3000,
            temperature=0.7
        )
        
        logger.info(f"Generated lesson content using {provider_used.value}")
        
        # Parse the AI response into teaching steps
        teaching_steps = parse_teaching_steps_from_response(response, topic)
        
        return teaching_steps
        
    except Exception as e:
        logger.error(f"Error generating teaching steps: {str(e)}")
        # Return fallback content
        return create_fallback_teaching_steps(topic, topic_info)

async def generate_practice_problems(topic: str, user_level: str, num_problems: int) -> List[MathProblem]:
    """Generate practice problems for the topic"""
    
    prompt = f"""Create {num_problems} practice problems for {topic} at {user_level} level.

Requirements:
- Problems should match the student's current level
- Include a variety of problem types
- Provide complete step-by-step solutions
- Make problems engaging and relevant

For each problem, provide:
- A clear question statement
- Step-by-step solution
- Brief explanation of concepts used

Format as JSON with: question, solution_steps, difficulty"""

    try:
        messages = [
            ConversationMessage(role=MessageRole.SYSTEM, content=math_agents["problem_solver"]["system_prompt"]),
            ConversationMessage(role=MessageRole.USER, content=prompt)
        ]
        
        response, _ = await llm_client.generate_response(
            messages=messages,
            preferred_provider=Provider.OPENAI,  # OpenAI is good for structured output
            max_tokens=2000,
            temperature=0.8
        )
        
        # Parse response into practice problems
        problems = parse_practice_problems_from_response(response, topic)
        return problems
        
    except Exception as e:
        logger.error(f"Error generating practice problems: {str(e)}")
        return create_fallback_practice_problems(topic, user_level)

async def generate_explanation_steps(
    question: str, 
    topic: str, 
    user_level: str, 
    agent_type: str, 
    show_work: bool
) -> List[TeachingStep]:
    """Generate explanation for a specific question"""
    
    agent = math_agents[agent_type]
    
    prompt = f"""Explain this math question step by step: "{question}"

Student Level: {user_level}
Topic: {topic}
Show Work: {show_work}

Provide a clear, step-by-step explanation that:
1. Identifies what type of problem this is
2. Explains the approach to solve it
3. Shows each step with reasoning
4. Checks the final answer

Format as teaching steps suitable for whiteboard presentation."""

    try:
        messages = [
            ConversationMessage(role=MessageRole.SYSTEM, content=agent["system_prompt"]),
            ConversationMessage(role=MessageRole.USER, content=prompt)
        ]
        
        response, _ = await llm_client.generate_response(
            messages=messages,
            max_tokens=2000,
            temperature=0.7
        )
        
        return parse_teaching_steps_from_response(response, topic)
        
    except Exception as e:
        logger.error(f"Error generating explanation: {str(e)}")
        return []

def determine_agent_type(question: str) -> str:
    """Determine which agent is best suited for the question"""
    question_lower = question.lower()
    
    if any(word in question_lower for word in ["solve", "calculate", "find", "what is"]):
        return "problem_solver"
    elif any(word in question_lower for word in ["why", "how", "explain", "understand"]):
        return "concept_builder"
    else:
        return "fundamentals_teacher"

def parse_teaching_steps_from_response(response: str, topic: str) -> List[TeachingStep]:
    """Parse AI response into structured teaching steps"""
    steps = []
    
    try:
        # Split response into meaningful chunks
        lines = [line.strip() for line in response.split('\n') if line.strip()]
        step_count = 0
        
        for i, line in enumerate(lines):
            if line and not line.startswith('#') and len(line) > 10:
                step_count += 1
                if step_count <= 10:  # Limit to 10 steps
                    
                    # Determine step type based on content
                    step_type = "concept"
                    if any(word in line.lower() for word in ["example", "practice", "solve"]):
                        step_type = "example"
                    elif any(word in line.lower() for word in ["review", "summary", "remember"]):
                        step_type = "review"
                    
                    # Create visual content from the line
                    visual_content = line[:80] + "..." if len(line) > 80 else line
                    
                    # Create voice text (more conversational)
                    voice_text = f"Now let's look at this: {line}"
                    if step_count == 1:
                        voice_text = f"Welcome! Let's start our lesson. {line}"
                    
                    step = TeachingStep(
                        id=f"step_{topic}_{step_count}",
                        step_number=step_count,
                        explanation=f"Step {step_count}: {line[:50]}...",
                        visual_content=visual_content,
                        voice_text=voice_text,
                        duration_seconds=30.0 + (len(line) / 10),  # Longer for longer content
                        coordinates={"x": 50, "y": 10 + step_count * 8},
                        step_type=step_type
                    )
                    steps.append(step)
        
        return steps
        
    except Exception as e:
        logger.error(f"Error parsing teaching steps: {str(e)}")
        return create_fallback_teaching_steps(topic, {"name": topic})

def create_fallback_teaching_steps(topic: str, topic_info: Dict[str, Any]) -> List[TeachingStep]:
    """Create engaging fallback teaching steps optimized for handwriting-style classroom experience"""
    topic_name = topic_info.get('name', topic.title())
    
    if topic.lower() == "algebra":
        return [
            TeachingStep(
                id=f"fallback_{topic}_1",
                step_number=1,
                explanation="Welcome to Algebra!",
                visual_content="🎯 Welcome to Algebra!\n\nToday we'll discover the magic of letters and numbers working together.\n\nGet ready for an exciting mathematical adventure!",
                voice_text="Hello and welcome to algebra! I'm so excited to be your math teacher today. Algebra might sound scary, but I promise you it's actually like learning a secret code that helps us solve amazing puzzles. Are you ready to become a mathematical detective with me?",
                duration_seconds=20.0,
                coordinates={"x": 50, "y": 15},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_2",
                step_number=2,
                explanation="What is Algebra?",
                visual_content="What is Algebra? 🤔\n\n• It's like a secret mathematical language\n• We use letters (x, y, z) instead of just numbers\n• These letters represent mystery numbers\n• Our job: solve the mystery!",
                voice_text="So what exactly is algebra? Think of it as learning a secret language that mathematicians use. Instead of always working with regular numbers like 5 or 10, we use letters like x and y. These letters represent mystery numbers that we need to figure out. It's like being a detective!",
                duration_seconds=25.0,
                coordinates={"x": 50, "y": 20},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_3",
                step_number=3,
                explanation="Understanding Variables",
                visual_content="Variables = Mystery Boxes 📦\n\nImagine: x = 📦 (mystery number inside)\n\nWhen we solve algebra:\n📦 → 5 (we open the box!)\n\nSo x = 5",
                voice_text="Let me explain variables in the simplest way possible. Imagine the letter x is like a mystery box. Inside this box is a number, but we don't know what it is yet. When we solve an algebra problem, we're opening that box to discover what number was hiding inside all along!",
                duration_seconds=22.0,
                coordinates={"x": 50, "y": 30},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_4",
                step_number=4,
                explanation="Your First Algebra Problem",
                visual_content="Let's Solve Together! 💡\n\nProblem: x + 3 = 8\n\nQuestion: What number plus 3 equals 8?\nThink: ___ + 3 = 8\nAnswer: 5 + 3 = 8 ✓\n\nSo x = 5!",
                voice_text="Now let's solve our very first algebra problem together! We have x plus 3 equals 8. I want you to think with me: what number, when we add 3 to it, gives us 8? Take a moment to think... If you said 5, you're absolutely right! Five plus three equals eight, so x must equal 5!",
                duration_seconds=28.0,
                coordinates={"x": 50, "y": 40},
                step_type="example"
            ),
            TeachingStep(
                id=f"fallback_{topic}_5",
                step_number=5,
                explanation="The Step-by-Step Method",
                visual_content="The Algebra Recipe 📝\n\nx + 3 = 8\n\nStep 1: Get x alone (subtract 3 from both sides)\nx + 3 - 3 = 8 - 3\n\nStep 2: Simplify\nx = 5\n\nStep 3: Check our answer ✓\n5 + 3 = 8 ✓ Perfect!",
                voice_text="Now let me teach you the step-by-step method that works every single time. Think of it as a recipe for solving algebra. First, we want to get x all by itself. Since we have plus 3, we subtract 3 from both sides. This gives us x equals 5. Always remember to check your answer - and look, 5 plus 3 does equal 8!",
                duration_seconds=32.0,
                coordinates={"x": 50, "y": 50},
                step_type="example"
            )
        ]
    
    elif topic.lower() == "arithmetic":
        return [
            TeachingStep(
                id=f"fallback_{topic}_1",
                step_number=1,
                explanation="Welcome to Arithmetic!",
                visual_content="🔢 Welcome to Arithmetic!\n\nThe Foundation of All Mathematics\n\nToday we'll master the building blocks:\n+ - × ÷",
                voice_text="Hello! Welcome to arithmetic - the foundation of all mathematics! Think of arithmetic as your mathematical toolbox. Today we're going to learn about the four basic operations that you'll use everywhere in math. These are the building blocks that make everything else possible!",
                duration_seconds=18.0,
                coordinates={"x": 50, "y": 15},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_2",
                step_number=2,
                explanation="The Four Operations",
                visual_content="The Fantastic Four Operations! ⭐\n\n+ Addition: Combining things together\n- Subtraction: Taking things away\n× Multiplication: Groups of things\n÷ Division: Sharing equally",
                voice_text="Let me introduce you to the fantastic four operations! Addition is like combining things together - putting groups of objects into one big group. Subtraction is taking things away. Multiplication is like having groups of things - for example, 3 groups of 4 objects each. And division is sharing things equally among people.",
                duration_seconds=26.0,
                coordinates={"x": 50, "y": 25},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_3",
                step_number=3,
                explanation="Order of Operations (PEMDAS)",
                visual_content="The Secret Order: PEMDAS 🎯\n\nP - Parentheses ( )\nE - Exponents ²\nM - Multiplication ×\nD - Division ÷\nA - Addition +\nS - Subtraction -\n\nAlways work in this order!",
                voice_text="Now I'll teach you one of the most important secrets in mathematics - the order of operations, which we remember using PEMDAS. This tells us which calculations to do first when we have a long math problem. Think of it as the traffic rules for mathematics - everyone follows the same rules so we all get the same answer!",
                duration_seconds=30.0,
                coordinates={"x": 50, "y": 35},
                step_type="concept"
            ),
            TeachingStep(
                id=f"fallback_{topic}_4",
                step_number=4,
                explanation="Let's Practice Together",
                visual_content="Practice Problem: 15 + 8 × 2 - 6 ÷ 3\n\nStep 1: Multiplication and Division first\n8 × 2 = 16    and    6 ÷ 3 = 2\n\nStep 2: Now we have: 15 + 16 - 2\n\nStep 3: Addition and Subtraction (left to right)\n15 + 16 = 31\n31 - 2 = 29\n\nAnswer: 29 ✓",
                voice_text="Let's practice together with this problem: 15 plus 8 times 2 minus 6 divided by 3. Remember PEMDAS! First, we do multiplication and division. 8 times 2 equals 16, and 6 divided by 3 equals 2. Now we have 15 plus 16 minus 2. Working left to right: 15 plus 16 equals 31, then 31 minus 2 equals 29. Great work!",
                duration_seconds=35.0,
                coordinates={"x": 50, "y": 45},
                step_type="example"
            )
        ]
    
    # Default fallback for any other topic
    return [
        TeachingStep(
            id=f"fallback_{topic}_1",
            step_number=1,
            explanation=f"Welcome to {topic_name}!",
            visual_content=f"📚 Welcome to {topic_name}!\n\nYour Personal Math Teacher\n\nToday's Journey:\n• Start from the basics\n• Build understanding step by step\n• Practice together\n• Master the concepts!",
            voice_text=f"Hello and welcome! I'm your personal AI math teacher, and I'm absolutely delighted to teach you about {topic_name} today. Don't worry if this is new to you - we're going to start from the very beginning and build your understanding piece by piece. I'm here to support you every step of the way!",
            duration_seconds=25.0,
            coordinates={"x": 50, "y": 15},
            step_type="concept"
        ),
        TeachingStep(
            id=f"fallback_{topic}_2",
            step_number=2,
            explanation="Our Learning Approach",
            visual_content=f"How We'll Learn {topic_name} 🎯\n\n1. 🔍 Explore the basics\n2. 🧩 Break down complex ideas\n3. 💡 See real examples\n4. 🏃‍♂️ Practice together\n5. 🎉 Celebrate your progress!",
            voice_text=f"Let me explain how we'll tackle {topic_name} together. First, we'll explore the fundamental concepts - the building blocks. Then we'll break down any complex ideas into simple, bite-sized pieces. We'll look at real examples to see how everything works, practice together so you feel confident, and celebrate your amazing progress along the way!",
            duration_seconds=28.0,
            coordinates={"x": 50, "y": 30},
            step_type="concept"
        ),
        TeachingStep(
            id=f"fallback_{topic}_3",
            step_number=3,
            explanation="Ready to Begin!",
            visual_content=f"Let's Start Our {topic_name} Adventure! 🚀\n\nRemember:\n• No question is too small\n• Mistakes help us learn\n• We'll go at your pace\n• You've got this!\n\nReady? Let's begin! ✨",
            voice_text=f"Alright, are you ready to begin our {topic_name} adventure? I want you to remember a few things: there's no such thing as a silly question, mistakes are just stepping stones to learning, we'll go at whatever pace feels comfortable for you, and most importantly - you've absolutely got this! I believe in you completely. Let's start learning!",
            duration_seconds=30.0,
            coordinates={"x": 50, "y": 45},
            step_type="concept"
        )
    ]

def parse_practice_problems_from_response(response: str, topic: str) -> List[MathProblem]:
    """Parse AI response into practice problems"""
    # Simplified parser for practice problems
    problems = []
    
    try:
        # Create some basic problems based on topic
        for i in range(3):
            problem = MathProblem(
                id=f"problem_{topic}_{i+1}",
                topic=topic,
                question=f"Practice problem {i+1} for {topic}",
                difficulty="basic",
                solution_steps=[
                    "Step 1: Understand the problem",
                    "Step 2: Apply the appropriate method",
                    "Step 3: Calculate the result",
                    "Step 4: Check your answer"
                ]
            )
            problems.append(problem)
        
        return problems
        
    except Exception as e:
        logger.error(f"Error parsing practice problems: {str(e)}")
        return []

def create_fallback_practice_problems(topic: str, user_level: str) -> List[MathProblem]:
    """Create fallback practice problems"""
    return [
        MathProblem(
            id=f"fallback_{topic}_1",
            topic=topic,
            question=f"Basic {topic} practice problem",
            difficulty=user_level,
            solution_steps=["Work through this step by step", "Apply what you've learned", "Check your work"]
        )
    ]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004) 