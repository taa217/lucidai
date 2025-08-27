"""
LangChain Configuration and Setup for Multi-Agent Teaching System
Supports OpenAI, Anthropic, and Google AI with specialized agent configurations
"""

import os
import logging
from typing import Dict, Any, Optional, List
from .config import get_settings
from langchain.llms.base import LLM
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.memory import ConversationBufferWindowMemory
from langchain.agents import initialize_agent, AgentType
from langchain.tools import BaseTool
from langchain.schema import BaseMessage, HumanMessage, AIMessage
import httpx
import time
import asyncio
import json

# Determine the secondary LLM provider from environment variables
# This allows easy switching between providers like Anthropic and Google Gemini
# for content generation and Q&A, without changing the primary teacher agent.
SECONDARY_LLM_PROVIDER = os.getenv('SECONDARY_LLM_PROVIDER', 'anthropic').lower()
SERVICE_HOST = os.getenv('SERVICE_HOST', 'localhost')

# Get settings instance
settings = get_settings()

logger = logging.getLogger(__name__)

# --- Document Content Fetching ---
async def get_document_content(doc_id: str, user_id: str) -> Dict[str, Any]:
    """
    Asynchronously polls the document processor service until the document is processed,
    then fetches its content.
    """
    base_url = f"http://{SERVICE_HOST}:8002"
    status_url = f"{base_url}/status/{doc_id}"
    timeout_seconds = 180  # 3 minutes timeout for the whole process
    polling_interval_seconds = 5

    start_time = time.time()

    async with httpx.AsyncClient() as client:
        while time.time() - start_time < timeout_seconds:
            try:
                response = await client.get(status_url, timeout=10.0)
                response.raise_for_status()
                
                status_data = response.json()
                status = status_data.get('status')

                if status == 'completed':
                    logger.info(f"Document {doc_id} processing completed.")
                    return {
                        "id": doc_id,
                        "content": status_data.get("full_text", ""),
                        "metadata": status_data,
                    }
                
                elif status == 'error':
                    error_message = status_data.get('message', 'Unknown processing error')
                    logger.error(f"Document {doc_id} processing failed: {error_message}")
                    raise Exception(f"Document processing failed for {doc_id}: {error_message}")

                # If status is 'processing' or 'uploading', wait and poll again
                logger.info(f"Waiting for document {doc_id} to be processed. Current status: {status}")
                await asyncio.sleep(polling_interval_seconds)

            except httpx.HTTPStatusError as e:
                # Handle cases where the file ID is not found (404) or other server errors
                logger.error(f"HTTP error polling status for {doc_id}: {e.response.status_code} - {e.response.text}")
                raise Exception(f"Document Processor service returned an error for doc {doc_id}.")
            except httpx.RequestError as e:
                logger.error(f"Network request failed for {status_url}: {e}")
                # Fail soft so QnA can proceed without grounding
                raise
            except Exception as e:
                logger.error(f"An unexpected error occurred while fetching document {doc_id}: {e}")
                raise
        
        # If the loop exits due to timeout
        raise Exception(f"Timeout: Document {doc_id} did not process within {timeout_seconds} seconds.")

class LLMProvider:
    """LLM Provider configuration and management"""
    
    SUPPORTED_PROVIDERS = {
        'openai': {
            'models': ['gpt-5-2025-08-07', 'gpt-3.5-turbo', 'gpt-4.1'],
            'default_model': 'gpt-5-2025-08-07'
        },
        'anthropic': {
            'models': ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
            'default_model': 'claude-3-sonnet-20240229'
        },
        'google': {
            'models': ['gemini-2.0-flash', 'gemini-pro-vision'],
            'default_model': 'gemini-2.5-pro-preview-06-05'
        }
    }
    
    @classmethod
    def get_llm(cls, provider: str = 'openai', model: str = None, **kwargs) -> LLM:
        """Get configured LLM instance with fallback support"""
        try:
            provider = provider.lower()
            
            if provider not in cls.SUPPORTED_PROVIDERS:
                raise ValueError(f"Unsupported provider: {provider}")
            
            # Use default model if not specified
            if not model:
                model = cls.SUPPORTED_PROVIDERS[provider]['default_model']
            
            # Default parameters
            default_params = {
                'temperature': kwargs.get('temperature', 0.7),
                'max_tokens': kwargs.get('max_tokens', 2000),
            }
            
            if provider == 'openai':
                api_key = kwargs.get('api_key') or settings.openai_api_key
                if not api_key:
                    logger.warning("OpenAI API key not found, trying fallback providers...")
                    return cls._get_fallback_llm(**kwargs)
                
                return ChatOpenAI(
                    model=model,
                    openai_api_key=api_key,
                    **default_params
                )
            
            elif provider == 'anthropic':
                api_key = kwargs.get('api_key') or settings.anthropic_api_key
                if not api_key:
                    logger.warning("Anthropic API key not found, trying fallback providers...")
                    return cls._get_fallback_llm(**kwargs)
                
                return ChatAnthropic(
                    model=model,
                    anthropic_api_key=api_key,
                    **default_params
                )
            
            elif provider == 'google':
                api_key = kwargs.get('api_key') or settings.google_api_key
                if not api_key:
                    logger.warning("Google AI API key not found, trying fallback providers...")
                    return cls._get_fallback_llm(**kwargs)
                
                return ChatGoogleGenerativeAI(
                    model=model,
                    google_api_key=api_key,
                    **default_params
                )
            
        except Exception as e:
            logger.error(f"Error initializing LLM {provider}/{model}: {str(e)}")
            logger.info("Attempting fallback to available provider...")
            return cls._get_fallback_llm(**kwargs)
    
    @classmethod
    def _get_fallback_llm(cls, **kwargs):
        """Get a working LLM from available providers"""
        default_params = {
            'temperature': kwargs.get('temperature', 0.7),
            'max_tokens': kwargs.get('max_tokens', 2000),
        }
        
        # Try providers in order of preference
        fallback_providers = ['openai', 'anthropic', 'google']
        
        for provider in fallback_providers:
            try:
                if provider == 'openai':
                    api_key = settings.openai_api_key
                    if api_key:
                        return ChatOpenAI(
                            model='gpt-3.5-turbo',  # Use cheaper model for fallback
                            openai_api_key=api_key,
                            **default_params
                        )
                
                elif provider == 'anthropic':
                    api_key = settings.anthropic_api_key
                    if api_key:
                        return ChatAnthropic(
                            model='claude-3-haiku-20240307',  # Use cheaper model for fallback
                            anthropic_api_key=api_key,
                            **default_params
                        )
                
                elif provider == 'google':
                    api_key = settings.google_api_key
                    if api_key:
                        return ChatGoogleGenerativeAI(
                            model='gemini-2.0-flash',
                            google_api_key=api_key,
                            **default_params
                        )
            
            except Exception as e:
                logger.warning(f"Failed to initialize {provider}: {str(e)}")
                continue
        
        # If no providers are available, raise an error with helpful message
        raise ValueError(
            "No LLM providers available. Please set at least one of: "
            "OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY environment variables. "
            "You can copy env.example to .env and add your API keys."
        )

class AgentMemory:
    """Shared memory system for multi-agent coordination"""
    
    def __init__(self, memory_size: int = 10):
        self.conversation_memory = ConversationBufferWindowMemory(
            k=memory_size,
            return_messages=True
        )
        self.long_term_memory: Dict[str, Any] = {}
        self.user_profile: Dict[str, Any] = {}
        
    def add_conversation(self, human_message: str, ai_message: str):
        """Add conversation to memory"""
        self.conversation_memory.chat_memory.add_user_message(human_message)
        self.conversation_memory.chat_memory.add_ai_message(ai_message)
    
    def add_to_long_term(self, key: str, value: Any):
        """Store information in long-term memory"""
        self.long_term_memory[key] = value
    
    def get_from_long_term(self, key: str, default=None):
        """Retrieve from long-term memory"""
        return self.long_term_memory.get(key, default)
    
    def update_user_profile(self, updates: Dict[str, Any]):
        """Update user profile information"""
        self.user_profile.update(updates)
    
    def get_conversation_history(self) -> List[BaseMessage]:
        """Get recent conversation history"""
        return self.conversation_memory.chat_memory.messages
    
    def clear_conversation(self):
        """Clear conversation memory"""
        self.conversation_memory.clear()

class AgentConfiguration:
    """Configuration for different types of teaching agents"""
    
    AGENT_CONFIGS = {
        'master_teacher': {
            'provider': 'google',
            'model': 'gemini-2.0-flash',
            'temperature': 0.7,
            'system_prompt': """You are a Master Teaching Agent responsible for orchestrating personalized learning experiences.
            Your role is to:
            1. Coordinate other specialized agents
            2. Maintain overall teaching strategy
            3. Adapt to student's learning style and pace
            4. Ensure coherent lesson flow
            
            You have access to uploaded documents and should create engaging, personalized lessons."""
        },
        
        'content_specialist': {
            'provider': SECONDARY_LLM_PROVIDER,
            'model': 'claude-3-sonnet-20240229' if SECONDARY_LLM_PROVIDER == 'anthropic' else 'gemini-pro',
            'temperature': 0.6,
            'system_prompt': """You are a Content Specialist Agent with deep knowledge across academic subjects.
            Your role is to:
            1. Extract key concepts from uploaded materials
            2. Create structured learning content
            3. Provide accurate, detailed explanations
            4. Ensure content accuracy and relevance
            
            Focus on creating clear, comprehensive educational content."""
        },
        
        'visual_designer': {
            'provider': 'google',
            'model': 'gemini-2.0-flash',
            'temperature': 0.8,
            'system_prompt': """You are a Visual Teaching Agent specializing in whiteboard content and diagrams.
            Your role is to:
            1. Design visual representations of concepts
            2. Create step-by-step visual explanations
            3. Generate mathematical formulas and diagrams
            4. Plan progressive visual disclosure
            
            Think creatively about how to visualize complex concepts."""
        },
        
        'assessment_agent': {
            'provider': 'google',
            'model': 'gemini-2.0-flash',
            'temperature': 0.3,
            'system_prompt': """You are an Assessment Agent responsible for evaluating student understanding.
            Your role is to:
            1. Generate appropriate questions and exercises
            2. Evaluate student responses
            3. Identify knowledge gaps
            4. Suggest remedial content
            
            Be precise and constructive in your assessments."""
        },
        
        'personalization': {
            'provider': 'google',
            'model': 'gemini-2.0-flash',
            'temperature': 0.5,
            'system_prompt': """You are a Personalization Agent focused on learning style adaptation.
            Your role is to:
            1. Analyze student learning patterns
            2. Detect preferred learning modalities
            3. Adapt content presentation style
            4. Optimize teaching pace and difficulty
            
            Focus on making learning as effective as possible for each individual."""
        },
        
        'qna_agent': {
            'provider': SECONDARY_LLM_PROVIDER,
            'model': 'claude-3-haiku-20240307' if SECONDARY_LLM_PROVIDER == 'anthropic' else 'gemini-pro',
            'temperature': 0.8,
            'system_prompt': """You are a friendly and encouraging Q&A Agent.
            Your role is to:
            1. Answer complex questions based on the provided text
            2. Suggest analogies and real-world examples to aid understanding
            3. Provide accurate and relevant information
            4. Ensure the answer is based strictly on the provided context
            
            You will receive a question and a context from which to answer. 
            Base your answer strictly on the provided context. If the answer is not in the context, say so politely."""
        },
        
        'curriculum_designer': {
            'provider': 'google',
            'model': 'gemini-2.0-flash',
            'temperature': 0.5,
            'system_prompt': """You are an expert Curriculum Designer.
            Your role is to:
            1. Design comprehensive and engaging learning curriculum
            2. Align curriculum with educational goals and standards
            3. Create interactive and diverse learning experiences
            4. Ensure curriculum relevance and alignment with student needs"""
        }
    }
    
    @classmethod
    def get_agent_config(cls, agent_type: str) -> Dict[str, Any]:
        """Get configuration for specific agent type"""
        if agent_type not in cls.AGENT_CONFIGS:
            raise ValueError(f"Unknown agent type: {agent_type}")
        
        return cls.AGENT_CONFIGS[agent_type].copy()
    
    @classmethod
    def create_agent_llm(cls, agent_type: str, **kwargs) -> LLM:
        """Create LLM instance for specific agent"""
        config = cls.get_agent_config(agent_type)
        
        # Override config with kwargs
        for key, value in kwargs.items():
            if key in config:
                config[key] = value
        
        return LLMProvider.get_llm(
            provider=config['provider'],
            model=config['model'],
            temperature=config['temperature']
        )

class TeachingContext:
    """Context manager for teaching sessions"""
    
    def __init__(self, user_id: str, learning_goals: str, uploaded_documents: List[Dict] = None):
        self.user_id = user_id
        self.learning_goals = learning_goals
        self.uploaded_documents = uploaded_documents or []
        self.session_start = None
        self.current_topic = None
        self.lesson_plan: Dict[str, Any] = {}
        self.student_responses: List[Dict] = []
        
    def start_session(self):
        """Start a new teaching session"""
        from datetime import datetime
        self.session_start = datetime.utcnow()
        logger.info(f"Teaching session started for user {self.user_id}")
    
    def add_student_response(self, question: str, response: str, topic: str = None):
        """Record student response for analysis"""
        self.student_responses.append({
            'question': question,
            'response': response,
            'topic': topic or self.current_topic,
            'timestamp': self.session_start.isoformat() if self.session_start else None
        })
    
    def set_lesson_plan(self, plan: Dict[str, Any]):
        """Set the generated lesson plan"""
        self.lesson_plan = plan
    
    def get_context_summary(self) -> Dict[str, Any]:
        """Get summary of current teaching context"""
        return {
            'user_id': self.user_id,
            'learning_goals': self.learning_goals,
            'document_count': len(self.uploaded_documents),
            'current_topic': self.current_topic,
            'response_count': len(self.student_responses),
            'session_duration': self._get_session_duration()
        }
    
    def _get_session_duration(self) -> Optional[float]:
        """Calculate session duration in minutes"""
        if not self.session_start:
            return None
        
        from datetime import datetime
        duration = datetime.utcnow() - self.session_start
        return duration.total_seconds() / 60

class MultiAgentOrchestrator:
    """Orchestrator for coordinating multiple teaching agents"""
    
    def __init__(self):
        self.agents: Dict[str, Any] = {}
        self.memory = AgentMemory()
        self.current_context: Optional[TeachingContext] = None
        
    def initialize_agents(self):
        """Initialize all teaching agents"""
        try:
            for agent_type in AgentConfiguration.AGENT_CONFIGS.keys():
                llm = AgentConfiguration.create_agent_llm(agent_type)
                
                self.agents[agent_type] = {
                    'llm': llm,
                    'config': AgentConfiguration.get_agent_config(agent_type),
                    'initialized': True
                }
                
                logger.info(f"Initialized {agent_type} agent")
            
            logger.info("All teaching agents initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing agents: {str(e)}")
            raise
    
    def get_agent(self, agent_type: str) -> Dict[str, Any]:
        """Get specific agent"""
        if agent_type not in self.agents:
            raise ValueError(f"Agent {agent_type} not initialized")
        
        return self.agents[agent_type]
    
    def set_context(self, context: TeachingContext):
        """Set current teaching context"""
        self.current_context = context
        self.current_context.start_session()
    
    async def generate_lesson_plan(self, learning_goals: str, document_content: str, difficulty_level: str, user_id: str, plan_id: str) -> "LessonPlan":
        """
        Generates a lesson plan using the curriculum_designer agent.
        """
        logger.info(f"Orchestrator generating lesson plan for user {user_id}")

        prompt = f"""
        Based on the user's learning goal and the provided document content, create a structured lesson plan.

        Learning Goal: "{learning_goals}"
        Difficulty: {difficulty_level}
        
        Available Content:
        ---
        {document_content[:8000]}
        ---

        Your task is to generate a lesson plan with 3-5 modules. Each module must have a 'title', a 'description', and an 'estimated_duration' in minutes.
        The total duration should be around 45-60 minutes.

        For each module, the 'description' should be a concise, engaging summary of what the user will learn.
        It should be written to spark curiosity and clearly set expectations.

        Respond ONLY with a valid JSON object with a root key "modules".
        Each element in the "modules" list must be a JSON object with "title", "description", and "estimated_duration" keys.
        Example: {{"modules": [{{"title": "Intro to Quantum Mechanics", "description": "Explore the foundational principles of quantum mechanics, including wave-particle duality and the uncertainty principle.", "estimated_duration": 15}}]}}
        """

        response_str = ""
        try:
            # Use the curriculum_designer agent to get a structured JSON response
            response_str = await self._get_agent_response(
                agent_type='curriculum_designer',
                prompt=prompt
            )

            # The response from the agent should be a JSON string.
            # It might be wrapped in markdown, so we need to clean it.
            if "```json" in response_str:
                clean_response = response_str.split("```json")[1].split("```")[0].strip()
            else:
                # Find the first '{' and the last '}' to extract the JSON object
                start_index = response_str.find('{')
                end_index = response_str.rfind('}')
                if start_index != -1 and end_index != -1:
                    clean_response = response_str[start_index:end_index+1]
                else:
                    clean_response = response_str

            plan_data = json.loads(clean_response)

            # Construct the Pydantic model
            from datetime import datetime
            # This requires the LessonPlan pydantic model to be available here.
            # Let's assume it's imported from the main orchestrator file or a shared models file.
            # For now, creating a dictionary that matches the structure.
            
            total_duration = sum(module.get('estimated_duration', 0) for module in plan_data.get('modules', []))

            # This part assumes a LessonPlan model is defined and accessible.
            # The API handler will receive this dictionary and construct the final response model.
            return {
                "plan_id": plan_id,
                "user_id": user_id,
                "learning_goals": learning_goals,
                "modules": plan_data.get('modules', []),
                "estimated_duration": total_duration,
                "difficulty_level": difficulty_level,
                "created_at": datetime.utcnow().isoformat()
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode lesson plan JSON from agent: {e}\nResponse was: {response_str}")
            raise ValueError("The AI agent returned a malformed lesson plan. Could not decode JSON.")
        except Exception as e:
            logger.error(f"Error in orchestrator's generate_lesson_plan: {e}")
            raise

    async def coordinate_teaching(self, student_input: str) -> Dict[str, Any]:
        """Coordinate agents to produce a response to student input"""
        
        # 1. Determine which agent should handle the input
        if not self.current_context:
            raise ValueError("No teaching context set")
        
        try:
            # This is a simplified coordination - would be much more sophisticated in production
            master_teacher = self.get_agent('master_teacher')
            
            # Get response from master teacher
            response = await self._get_agent_response(
                'master_teacher',
                student_input,
                include_context=True
            )
            
            # Add to memory
            self.memory.add_conversation(student_input, response)
            
            return {
                'response': response,
                'agent': 'master_teacher',
                'context': self.current_context.get_context_summary()
            }
            
        except Exception as e:
            logger.error(f"Error in teaching coordination: {str(e)}")
            raise
    
    async def generate_teaching_segments(self, lesson_content: str, module_title: str, user_id: str) -> List[Dict[str, Any]]:
        """
        Generate intelligent teaching segments for whiteboard presentation
        Each segment includes what the AI should say and what should be displayed
        """
        logger.info(f"🎨 Generating AI teaching segments for: {module_title}")

        prompt = f"""
        You are an expert AI teacher preparing a dynamic whiteboard lesson. Based on the lesson content below, create 5-7 teaching segments that will:
        1. Engage the student with natural, conversational voice narration
        2. Display key concepts visually on a digital whiteboard
        3. Build understanding progressively from basics to advanced concepts

        LESSON CONTENT:
        Title: {module_title}
        Content: {lesson_content}

        Create teaching segments that follow this structure:
        - Introduction (welcome and overview)
        - 3-5 core concept segments (main learning points)
        - Summary and next steps

        For each segment, provide:
        - voice_text: What you'll say to the student (natural, engaging teacher voice)
        - visual_content: What appears on the whiteboard (concise, clear concepts)
        - teaching_notes: Key points to emphasize

        IMPORTANT GUIDELINES:
        - Voice text should be conversational and encouraging, like a friendly tutor
        - Visual content should be concise but meaningful (max 8 words per line)
        - Focus on the most important concepts from the provided content
        - Make it progressive - each segment builds on the previous
        - Include specific examples or key terms from the actual lesson content

        Respond with a JSON array of segments. Each segment should have this exact structure:
        {{
            "id": "segment_1",
            "voice_text": "Welcome to our lesson on...",
            "visual_content": "Main Topic Title",
            "teaching_notes": "Emphasize the importance of...",
            "coordinates": {{"x": 50, "y": 20}},
            "duration_seconds": 5
        }}

        Make the lesson engaging and educational based on the actual content provided.
        """

        try:
            response_str = await self._get_agent_response(
                agent_type='master_teacher',
                prompt=prompt,
                include_context=False
            )

            # Clean and parse JSON response
            if "```json" in response_str:
                clean_response = response_str.split("```json")[1].split("```")[0].strip()
            elif "```" in response_str:
                clean_response = response_str.split("```")[1].split("```")[0].strip()
            else:
                # Find the first '[' and the last ']' for array
                start_index = response_str.find('[')
                end_index = response_str.rfind(']')
                if start_index != -1 and end_index != -1:
                    clean_response = response_str[start_index:end_index+1]
                else:
                    clean_response = response_str

            segments = json.loads(clean_response)
            
            # Validate and enhance segments with positioning
            enhanced_segments = []
            for i, segment in enumerate(segments):
                enhanced_segment = {
                    "id": segment.get("id", f"segment_{i}"),
                    "voice_text": segment.get("voice_text", ""),
                    "visual_content": segment.get("visual_content", ""),
                    "teaching_notes": segment.get("teaching_notes", ""),
                    "coordinates": segment.get("coordinates", {"x": 50, "y": 20 + i * 15}),
                    "duration_seconds": segment.get("duration_seconds", 4)
                }
                enhanced_segments.append(enhanced_segment)

            logger.info(f"✅ Generated {len(enhanced_segments)} AI teaching segments for {module_title}")
            return enhanced_segments

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse teaching segments JSON: {e}\nResponse: {response_str}")
            # Return fallback segments
            return self._create_fallback_segments(module_title, lesson_content)
        except Exception as e:
            logger.error(f"Error generating teaching segments: {e}")
            return self._create_fallback_segments(module_title, lesson_content)

    def _create_fallback_segments(self, module_title: str, lesson_content: str) -> List[Dict[str, Any]]:
        """Create basic fallback segments if AI generation fails"""
        return [
            {
                "id": "intro",
                "voice_text": f"Welcome to our lesson on {module_title}. Let's explore this topic step by step.",
                "visual_content": module_title,
                "coordinates": {"x": 50, "y": 20},
                "duration_seconds": 4
            },
            {
                "id": "overview",
                "voice_text": "We'll cover the key concepts and practical applications you need to understand.",
                "visual_content": "Key Learning Objectives",
                "coordinates": {"x": 50, "y": 35},
                "duration_seconds": 5
            },
            {
                "id": "content",
                "voice_text": "Let's dive into the main content and explore these important concepts together.",
                "visual_content": "Main Concepts",
                "coordinates": {"x": 50, "y": 50},
                "duration_seconds": 6
            },
            {
                "id": "summary",
                "voice_text": f"That covers the essentials of {module_title}. You now have a solid foundation in this topic.",
                "visual_content": f"✓ {module_title} Complete",
                "coordinates": {"x": 50, "y": 75},
                "duration_seconds": 4
            }
        ]

    async def _get_agent_response(self, agent_type: str, prompt: str, include_context: bool = True) -> str:
        """Get response from specific agent"""
        agent = self.get_agent(agent_type)
        llm = agent['llm']
        
        # Build full prompt with context
        full_prompt = prompt
        
        if include_context and self.current_context:
            context_info = f"""
            Learning Goals: {self.current_context.learning_goals}
            Available Documents: {len(self.current_context.uploaded_documents)} files
            Current Topic: {self.current_context.current_topic or 'General'}
            
            Student Input: {prompt}
            """
            full_prompt = context_info
        
        # Get response from LLM
        messages = [HumanMessage(content=full_prompt)]
        response = await llm.ainvoke(messages)
        
        return response.content

# Factory functions for easy access
def get_orchestrator() -> MultiAgentOrchestrator:
    """Get configured multi-agent orchestrator"""
    orchestrator = MultiAgentOrchestrator()
    orchestrator.initialize_agents()
    return orchestrator

def create_teaching_context(user_id: str, learning_goals: str, documents: List[Dict] = None) -> TeachingContext:
    """Create new teaching context"""
    return TeachingContext(user_id, learning_goals, documents or []) 