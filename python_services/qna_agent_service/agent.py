"""
Q&A Agent - Core agent logic for educational question answering.
"""

from typing import List, Optional, Dict, Any, Tuple
import asyncio
import logging

# Import shared modules
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from shared.models import ConversationMessage, MessageRole, LLMProvider
from shared.llm_client import get_llm_client
from shared.memory import MemoryStore
from .document_context import retrieve_document_context


class QnAAgent:
    """
    Intelligent Q&A agent specialized for educational interactions.
    
    This agent:
    - Provides clear, educational explanations
    - Adapts to student level and learning style
    - Encourages further exploration
    - Uses Socratic method when appropriate
    """
    
    def __init__(self):
        self.llm_client = get_llm_client()
        self.logger = logging.getLogger(__name__)
        self.memory_store = MemoryStore()
        
        # Educational prompting templates
        self.base_system_prompt = """You are an expert AI tutor for Lucid Learn AI, a personalized learning platform. Your role is to help students learn effectively by:

1. **Clear Explanations**: Provide clear, accurate, and easy-to-understand explanations
2. **Educational Focus**: Always prioritize learning over just giving answers
3. **Encourage Thinking**: Use the Socratic method when appropriate - ask guiding questions
4. **Adaptive Teaching**: Adjust your explanation style based on the student's apparent level
5. **Positive Reinforcement**: Encourage curiosity and continued learning
6. **Safe Learning**: Ensure all content is educational and age-appropriate

Remember: You're not just answering questions, you're facilitating learning and understanding."""

    async def process_question(
        self,
        question: str,
        conversation_history: List[ConversationMessage],
        preferred_provider: Optional[LLMProvider] = None,
        context: Optional[Dict[str, Any]] = None,
        *,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Tuple[str, LLMProvider]:
        """
        Process a student's question and generate an educational response.
        
        Args:
            question: The student's question
            conversation_history: Previous conversation messages
            preferred_provider: Preferred LLM provider
            context: Additional context (subject, grade level, etc.)
        
        Returns:
            Tuple of (response_text, provider_used)
        """
        
        try:
            # Retrieve user memories and document chunks concurrently with short time budgets
            async def _get_memories() -> List[str]:
                if not user_id:
                    return []
                try:
                    return await asyncio.wait_for(
                        self.memory_store.search(user_id=user_id, query=question, limit=5),
                        timeout=2.0,
                    )
                except Exception:
                    return []

            async def _get_chunks() -> List[str]:
                try:
                    return await asyncio.wait_for(
                        retrieve_document_context(user_id=user_id, question=question, context=context or {}),
                        timeout=4.0,
                    )
                except Exception:
                    return []

            retrieved_memories, retrieved_chunks = await asyncio.gather(_get_memories(), _get_chunks())

            # Build the conversation context with retrieved knowledge
            enriched_context = dict(context or {})
            if retrieved_memories:
                enriched_context["_memories"] = retrieved_memories
            if retrieved_chunks:
                enriched_context["_retrieval_chunks"] = retrieved_chunks

            messages = await self._build_conversation_context(
                question, conversation_history, enriched_context
            )
            
            # Extract desired model and attachments (if any) from context
            desired_model: Optional[str] = None
            attachment_file_ids: list[str] = []
            try:
                if isinstance(context, dict):
                    model_info = context.get("model")
                    if isinstance(model_info, dict):
                        key = model_info.get("key")
                        if isinstance(key, str) and key.strip():
                            desired_model = key.strip()
                    # Accept file IDs at context.openai_file_id, context.openaiFileId or context.attachments
                    fid = context.get("openai_file_id") or context.get("openaiFileId")
                    if isinstance(fid, str) and fid:
                        attachment_file_ids.append(fid)
                    if isinstance(context.get("attachments"), list):
                        for item in context.get("attachments"):
                            if isinstance(item, str):
                                attachment_file_ids.append(item)
            except Exception:
                desired_model = None

            # Generate response using LLM
            # Enforce no provider fallback for ChatInterface requests: if OpenAI (default) fails, surface the error
            response_text, provider_used = await self.llm_client.generate_response(
                messages=messages,
                preferred_provider=preferred_provider or None,
                max_tokens=1200,  # Allow for detailed educational explanations
                temperature=0.7,  # Balance creativity with accuracy
                model=desired_model,
                attachments=attachment_file_ids or None,
                allow_fallback=False,
            )
            
            # Post-process the response for educational enhancement
            enhanced_response = await self._enhance_educational_response(
                response_text, question, context
            )

            # Persist interaction to memory (best-effort)
            if user_id:
                try:
                    await self.memory_store.add_interaction(
                        user_id=user_id,
                        session_id=session_id or "",
                        question=question,
                        answer=enhanced_response,
                        metadata={
                            "docId": (context or {}).get("docId"),
                            "documentTitle": (context or {}).get("documentTitle"),
                            "source": (context or {}).get("source"),
                        },
                    )
                except Exception:
                    pass
            
            # Provider may be an enum or a plain string depending on upstream
            try:
                provider_label = getattr(provider_used, 'value', provider_used)
            except Exception:
                provider_label = str(provider_used)
            self.logger.info(f"Q&A processed successfully using {provider_label}")
            
            return enhanced_response, provider_used
            
        except Exception as e:
            self.logger.error(f"Error processing question: {str(e)}")
            raise
    
    async def prepare_for_stream(
        self,
        question: str,
        conversation_history: List[ConversationMessage],
        context: Optional[Dict[str, Any]] = None,
        *,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Tuple[List[ConversationMessage], Optional[str], list[str], Dict[str, Any]]:
        """Prepare messages and options for streaming generation.
        Returns (messages, desired_model, attachment_file_ids, enriched_context).
        """
        # Retrieve user memories and document chunks concurrently with short time budgets
        async def _get_memories() -> List[str]:
            if not user_id:
                return []
            try:
                return await asyncio.wait_for(
                    self.memory_store.search(user_id=user_id, query=question, limit=5),
                    timeout=2.0,
                )
            except Exception:
                return []

        async def _get_chunks() -> List[str]:
            try:
                return await asyncio.wait_for(
                    retrieve_document_context(user_id=user_id, question=question, context=context or {}),
                    timeout=4.0,
                )
            except Exception:
                return []

        retrieved_memories, retrieved_chunks = await asyncio.gather(_get_memories(), _get_chunks())

        # Build the conversation context with retrieved knowledge
        enriched_context = dict(context or {})
        if retrieved_memories:
            enriched_context["_memories"] = retrieved_memories
        if retrieved_chunks:
            enriched_context["_retrieval_chunks"] = retrieved_chunks

        messages = await self._build_conversation_context(
            question, conversation_history, enriched_context
        )

        # Extract desired model and attachments (if any) from context
        desired_model: Optional[str] = None
        attachment_file_ids: list[str] = []
        try:
            if isinstance(context, dict):
                model_info = context.get("model")
                if isinstance(model_info, dict):
                    key = model_info.get("key")
                    if isinstance(key, str) and key.strip():
                        desired_model = key.strip()
                fid = context.get("openai_file_id") or context.get("openaiFileId")
                if isinstance(fid, str) and fid:
                    attachment_file_ids.append(fid)
                if isinstance(context.get("attachments"), list):
                    for item in context.get("attachments"):
                        if isinstance(item, str):
                            attachment_file_ids.append(item)
        except Exception:
            desired_model = desired_model or None

        return messages, desired_model, attachment_file_ids, enriched_context

    async def _build_conversation_context(
        self,
        question: str,
        conversation_history: List[ConversationMessage],
        context: Optional[Dict[str, Any]] = None
    ) -> List[ConversationMessage]:
        """Build the full conversation context for the LLM."""
        
        messages = []
        
        # Add system prompt with any contextual modifications
        system_prompt = self.base_system_prompt
        
        if context:
            # Enhance system prompt with context
            if "subject" in context:
                system_prompt += f"\n\nCurrent Subject: {context['subject']}"
            
            if "grade_level" in context:
                system_prompt += f"\nStudent Grade Level: {context['grade_level']}"
            
            if "learning_style" in context:
                system_prompt += f"\nPreferred Learning Style: {context['learning_style']}"
            
            if "difficulty_preference" in context:
                system_prompt += f"\nDifficulty Level: {context['difficulty_preference']}"

            # Add document context to system prompt for grounding
            if context.get("documentTitle"):
                system_prompt += f"\nDocument in focus: {context['documentTitle']}"
            if context.get("docId"):
                system_prompt += f"\nDocument ID: {context['docId']}"

            # Inject user customization preferences if provided by backend
            try:
                user_prefs = context.get("userPreferences") or {}
                if isinstance(user_prefs, dict) and user_prefs:
                    display_name = user_prefs.get("displayName")
                    occupation = user_prefs.get("occupation")
                    traits = user_prefs.get("traits")
                    extra_notes = user_prefs.get("extraNotes")
                    preferred_language = user_prefs.get("preferredLanguage")

                    pref_lines = []
                    if display_name:
                        pref_lines.append(f"Student preferred name: {display_name}")
                    if occupation:
                        pref_lines.append(f"Student background/occupation: {occupation}")
                    if traits:
                        pref_lines.append(f"Teaching persona preferences: {traits}")
                    if extra_notes:
                        pref_lines.append(f"Additional notes: {extra_notes}")
                    if preferred_language:
                        pref_lines.append(f"Respond in the student's preferred language: {preferred_language}")

                    if pref_lines:
                        system_prompt += "\n\nUser customization preferences (apply throughout the conversation):\n" + "\n".join([f"- {line}" for line in pref_lines])
            except Exception:
                pass
        
        messages.append(ConversationMessage(
            role=MessageRole.SYSTEM,
            content=system_prompt
        ))
        
        # Inject retrieved memory snippets as context
        if context and context.get("_memories"):
            memory_block = "\n".join([f"- {m}" for m in context["_memories"]])
            messages.append(ConversationMessage(
                role=MessageRole.SYSTEM,
                content=(
                    "Relevant prior knowledge about this learner and topic (from memory):\n"
                    f"{memory_block}"
                )
            ))

        # Inject retrieved document chunks as grounding context
        if context and context.get("_retrieval_chunks"):
            # Limit to top 5 chunks to avoid overloading context window
            top_chunks = context["_retrieval_chunks"][:5]
            chunk_block = "\n---\n".join(top_chunks)
            messages.append(ConversationMessage(
                role=MessageRole.SYSTEM,
                content=(
                    "Use the following document excerpts as authoritative context."
                    " If the user's question is unrelated, answer normally.\n\n"
                    f"{chunk_block}"
                )
            ))

        # Add conversation history (limit to recent messages for context window)
        recent_history = conversation_history[-8:] if len(conversation_history) > 8 else conversation_history
        messages.extend(recent_history)
        
        # Add the current question
        messages.append(ConversationMessage(
            role=MessageRole.USER,
            content=question
        ))
        
        return messages
    
    async def _enhance_educational_response(
        self,
        response: str,
        original_question: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Post-process the response to enhance educational value.
        """
        
        # For now, we'll add some basic educational enhancements
        # In the future, this could include:
        # - Adding related concept suggestions
        # - Including practice problems
        # - Suggesting follow-up questions
        
        enhanced_response = response
        
        # Add encouragement for further learning (simple heuristic)
        if any(word in original_question.lower() for word in ["what", "how", "why", "explain"]):
            if not any(phrase in response.lower() for phrase in ["follow-up", "practice", "try"]):
                enhanced_response += "\n\n💡 **Want to explore more?** Feel free to ask follow-up questions or request practice problems!"
        
        return enhanced_response
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Return the capabilities of this agent."""
        return {
            "agent_type": "qna",
            "supported_subjects": "all",
            "features": [
                "educational_explanations",
                "socratic_method",
                "adaptive_difficulty",
                "conversation_context",
                "multi_provider_llm"
            ],
            "max_tokens": 1200,
            "supported_providers": [p.value for p in self.llm_client.get_available_providers()]
        } 