"""
Shared Pydantic models for inter-service communication.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from enum import Enum


class MessageRole(str, Enum):
    """Roles for conversation messages."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ConversationMessage(BaseModel):
    """A single message in a conversation."""
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    PERPLEXITY = "perplexity"


class AgentRequest(BaseModel):
    """Base request model for AI agents."""
    session_id: str
    user_id: str
    message: str
    conversation_history: List[ConversationMessage] = []
    preferred_provider: Optional[LLMProvider] = None
    context: Optional[Dict[str, Any]] = None


class AgentResponse(BaseModel):
    """Base response model from AI agents."""
    session_id: str
    response: str
    confidence: float = Field(ge=0.0, le=1.0)
    provider_used: LLMProvider
    processing_time_ms: int
    metadata: Optional[Dict[str, Any]] = None


class HealthCheck(BaseModel):
    """Health check response model."""
    service: str
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = "0.1.0"


class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Slide-related models
class SlideType(str, Enum):
    """Types of slides for different teaching purposes"""
    TITLE = "title"
    CONTENT = "content"
    EXAMPLE = "example"
    PRACTICE = "practice"
    QUIZ = "quiz"
    SUMMARY = "summary"
    TRANSITION = "transition"


class SlideLayout(str, Enum):
    """Predefined layouts for slides"""
    FULL_TEXT = "full_text"
    TEXT_IMAGE = "text_image"
    BULLET_POINTS = "bullet_points"
    DIAGRAM = "diagram"
    CODE_SNIPPET = "code_snippet"
    MATH_EQUATION = "math_equation"
    COMPARISON = "comparison"
    TIMELINE = "timeline"


class SourceReference(BaseModel):
    """Citation/source for slide content"""
    type: str = Field(..., description="Source type: document, web, knowledge_base")
    id: Optional[str] = Field(None, description="Document ID or URL")
    title: str = Field(..., description="Human-readable source title")
    page: Optional[int] = Field(None, description="Page number if applicable")
    excerpt: Optional[str] = Field(None, description="Relevant excerpt from source")
    confidence: float = Field(0.8, description="Confidence score 0-1")


class SlideContent(BaseModel):
    """Content block within a slide"""
    type: str = Field(..., description="text, bullet_list, image, diagram, equation, code")
    value: Any = Field(..., description="The actual content")
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 50, "y": 50})
    style: Optional[Dict[str, Any]] = Field(None, description="Visual styling options")
    animation: Optional[str] = Field(None, description="Animation type: fade_in, slide_up, etc")
    reveal_order: Optional[int] = Field(None, description="Order in which this block should appear (lower = earlier)")
    reveal_delay: Optional[float] = Field(None, description="Time in seconds after slide start when this block should appear")


class Slide(BaseModel):
    """Individual slide in a teaching deck"""
    id: str = Field(..., description="Unique slide identifier")
    slide_number: int = Field(..., description="Position in deck (1-indexed)")
    type: SlideType
    layout: SlideLayout
    title: Optional[str] = Field(None, description="Slide title/heading")
    contents: List[SlideContent] = Field(default_factory=list)
    speaker_notes: str = Field("", description="What the AI teacher will say")
    duration_seconds: float = Field(30.0, description="Estimated time for this slide")
    sources: List[SourceReference] = Field(default_factory=list)
    
    # Interactive elements
    requires_interaction: bool = Field(False)
    interaction_type: Optional[str] = Field(None, description="quiz, poll, exercise")
    interaction_data: Optional[Dict[str, Any]] = Field(None)
    
    # Adaptive teaching
    difficulty_level: str = Field("medium", description="easy, medium, hard")
    can_skip: bool = Field(True, description="Can be skipped if student is advanced")
    prerequisites: List[str] = Field(default_factory=list, description="Concept IDs that should be understood first")

    # Dynamic reveal controls
    auto_advance: bool = Field(True, description="Automatically move to next slide when all content revealed")


class DeckMetadata(BaseModel):
    """Metadata about the slide deck"""
    total_slides: int
    estimated_duration_minutes: float
    difficulty_level: str
    topics_covered: List[str]
    learning_objectives: List[str]
    generated_at: datetime
    model_used: str
    generation_params: Dict[str, Any] = Field(default_factory=dict)


class Deck(BaseModel):
    """Complete slide deck for a lesson"""
    deck_id: str = Field(..., description="Unique deck identifier")
    user_id: str = Field(..., description="User who requested this deck")
    learning_goal: str = Field(..., description="Original learning prompt from user")
    title: str = Field(..., description="Deck title")
    description: str = Field(..., description="Brief description of what will be taught")
    
    slides: List[Slide] = Field(..., min_items=3, max_items=50)
    metadata: DeckMetadata
    
    # Voice settings
    voice_id: str = Field("default", description="Voice ID for narration")
    voice_speed: float = Field(1.0, description="Playback speed multiplier")
    
    # Adaptive settings
    allow_branching: bool = Field(True, description="Can dynamically add/remove slides")
    student_level: str = Field("beginner")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class SlideGenerationRequest(BaseModel):
    """Request to generate a slide deck"""
    user_id: str
    learning_goal: str
    uploaded_documents: List[str] = Field(default_factory=list, description="Document IDs to use as source")
    preferred_duration_minutes: Optional[int] = Field(20, description="Target lesson length")
    difficulty_level: Optional[str] = Field("auto", description="auto, beginner, intermediate, advanced")
    include_practice: bool = Field(True, description="Include practice problems")
    visual_style: Optional[str] = Field("modern", description="modern, academic, playful, minimal")
    max_slides: Optional[int] = Field(30)


class SlideGenerationResponse(BaseModel):
    """Response after generating slides"""
    deck: Deck
    generation_time_seconds: float
    tokens_used: int
    sources_consulted: int
    status: str = Field("completed", description="completed, partial, failed")
    warnings: List[str] = Field(default_factory=list) 