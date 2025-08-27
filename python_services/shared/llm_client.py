"""
Unified LLM client for multiple providers.
"""

import asyncio
import time
from typing import List, Optional, Dict
from abc import ABC, abstractmethod

import openai
import anthropic
from httpx import AsyncClient
import os

# Gemini (Google Generative AI) import
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

from .models import ConversationMessage, LLMProvider, MessageRole
from .config import get_settings


class LLMClient(ABC):
    """Abstract base class for LLM clients."""
    
    @abstractmethod
    async def generate_response(
        self, 
        messages: List[ConversationMessage],
        max_tokens: int = 1000,
        temperature: float = 0.7
    ) -> str:
        """Generate a response from the LLM."""
        pass


class OpenAIClient(LLMClient):
    """OpenAI API client."""
    
    def __init__(self, api_key: str, organization: str | None = None, project: str | None = None, default_model: str = "gpt-5-2025-08-07"):
        def _normalize_openai_model(requested: str) -> str:
            # Keep user-requested IDs intact, only guard empty string
            return requested or "gpt-5-2025-08-07"

        client_kwargs = {"api_key": api_key}
        if organization:
            client_kwargs["organization"] = organization
        if project:
            client_kwargs["project"] = project
        self.client = openai.AsyncOpenAI(**client_kwargs)
        normalized = _normalize_openai_model(default_model)
        self.default_model = normalized
        try:
            print(f"[LLM] OpenAI client initialized (model: {self.default_model})")
        except Exception:
            pass
    
    async def generate_response(
        self, 
        messages: List[ConversationMessage],
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: str | None = None,
        attachments: list[str] | None = None,
    ) -> str:
        """Generate response using OpenAI API."""
        
        selected_model = (model or self.default_model)
        # Convert our messages to OpenAI format
        openai_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
        ]
        
        def _is_responses_first_model(model_id: str) -> bool:
            lid = (model_id or "").lower()
            # Treat GPT-5 family and nano/ thinking variants as Responses-API-first
            return ("gpt-5" in lid) or ("-nano" in lid) or ("thinking" in lid)

        try:
            print(">>> [OpenAI] About to call OpenAI API")
            # For modern models (e.g., GPT-5 family / nano), use the Responses API exclusively
            if _is_responses_first_model(selected_model):
                # Build Responses API input. If attachments exist, use structured input with input_file parts.
                if attachments:
                    print(f"[OpenAI] Using attachments: {attachments}")
                    user_text = "\n".join([
                        f"[{msg.role.value.upper()}] {msg.content}" for msg in messages
                    ])
                    input_payload = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": user_text},
                                *[{"type": "input_file", "file_id": fid} for fid in attachments if isinstance(fid, str)],
                            ]
                        }
                    ]
                else:
                    input_payload = "\n".join([
                        f"[{msg.role.value.upper()}] {msg.content}" for msg in messages
                    ])

                resp = await self.client.responses.create(
                    model=selected_model,
                    input=input_payload,
                    reasoning={"effort": "low"},
                    text={"verbosity": "low"},
                    max_output_tokens=max_tokens
                )
                if getattr(resp, "output_text", None):
                    return resp.output_text
                output_text_chunks = []
                if hasattr(resp, "output") and resp.output:
                    for item in resp.output:
                        content_list = getattr(item, "content", None)
                        if content_list:
                            for part in content_list:
                                text_val = getattr(part, "text", None)
                                if text_val:
                                    output_text_chunks.append(text_val)
                joined = "".join(output_text_chunks).strip()
                if joined:
                    return joined
                # If incomplete due to token cap, re-try with higher cap
                if getattr(resp, "status", None) == "incomplete":
                    incomplete = getattr(resp, "incomplete_details", None)
                    reason = getattr(incomplete, "reason", None) if incomplete else None
                    if reason == "max_output_tokens":
                        print("[OpenAI] Responses API incomplete; retrying with higher max_output_tokens...")
                        fallback_max = min(max_tokens + 512, 4096)
                        resp2 = await self.client.responses.create(
                            model=selected_model,
                            input=(input_payload if attachments else (input_payload + "\n\nContinue and conclude succinctly.")),
                            reasoning={"effort": "low"},
                            text={"verbosity": "low"},
                            max_output_tokens=fallback_max
                        )
                        if getattr(resp2, "output_text", None):
                            return resp2.output_text
                        retry_chunks = []
                        if hasattr(resp2, "output") and resp2.output:
                            for item in resp2.output:
                                content_list = getattr(item, "content", None)
                                if content_list:
                                    for part in content_list:
                                        text_val = getattr(part, "text", None)
                                        if text_val:
                                            retry_chunks.append(text_val)
                        joined2 = "".join(retry_chunks).strip()
                        if joined2:
                            return joined2
                # If no output, do NOT fall back to chat.completions for responses-first models
                # Raise to allow caller to try another provider (e.g., Anthropic) or handle gracefully
                raise Exception("Responses API returned no text output for responses-first model")

            # Legacy path for non-responses-first models only
            response = await self.client.chat.completions.create(
                model=selected_model,
                messages=openai_messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            print("<<< [OpenAI] OpenAI API call returned")
            return response.choices[0].message.content or ""
            
        except Exception as e:
            # If the model rejects 'max_tokens', retry with 'max_completion_tokens' per new API requirements
            error_text = str(e)
            # Do not auto-downgrade model IDs; proceed to parameter/Responses fallbacks
            if "Unsupported parameter" in error_text and "max_tokens" in error_text:
                try:
                    print("[OpenAI] Retrying with 'max_completion_tokens'...")
                    response = await self.client.chat.completions.create(
                        model=selected_model,
                        messages=openai_messages,
                        max_completion_tokens=max_tokens,  # Newer models expect this
                        temperature=temperature
                    )
                    print("<<< [OpenAI] OpenAI API call returned (with max_completion_tokens)")
                    return response.choices[0].message.content or ""
                except Exception as e2:
                    # As a final fallback, try the Responses API which expects 'input' and 'max_output_tokens'
                    try:
                        print("[OpenAI] Retrying via Responses API...")
                        # Responses API expects 'input' and uses 'max_output_tokens'
                        # Use structured input if attachments were provided
                        if attachments:
                            user_text = "\n".join([
                                f"[{msg.role.value.upper()}] {msg.content}" for msg in messages
                            ])
                            input_payload = [
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "input_text", "text": user_text},
                                        *[{"type": "input_file", "file_id": fid} for fid in attachments if isinstance(fid, str)],
                                    ]
                                }
                            ]
                        else:
                            input_payload = "\n".join([
                                f"[{msg.role.value.upper()}] {msg.content}" for msg in messages
                            ])
                        resp = await self.client.responses.create(
                            model=selected_model,
                            input=input_payload,
                            reasoning={"effort": "low"},
                            text={"verbosity": "low"},
                            max_output_tokens=max_tokens
                        )
                        # Prefer aggregated text when available
                        if getattr(resp, "output_text", None):
                            return resp.output_text
                        # Try to extract from structured output
                        output_text_chunks = []
                        if hasattr(resp, "output") and resp.output:
                            for item in resp.output:
                                # Some SDKs wrap text parts inside item.content with .text
                                content_list = getattr(item, "content", None)
                                if content_list:
                                    for part in content_list:
                                        text_val = getattr(part, "text", None)
                                        if text_val:
                                            output_text_chunks.append(text_val)
                        joined = "".join(output_text_chunks).strip()
                        if joined:
                            return joined
                        # If model did not produce text due to token cap, retry with bigger budget and lower reasoning
                        if getattr(resp, "status", None) == "incomplete":
                            incomplete = getattr(resp, "incomplete_details", None)
                            reason = getattr(incomplete, "reason", None) if incomplete else None
                            if reason == "max_output_tokens":
                                print("[OpenAI] Responses API incomplete due to token cap; retrying with higher max_output_tokens and low reasoning...")
                                fallback_max = min(max_tokens + 512, 4096)
                                resp2 = await self.client.responses.create(
                                    model=self.default_model,
                                    input=(input_payload if attachments else (input_payload + "\n\nContinue and provide the final answer succinctly.")),
                                    reasoning={"effort": "low"},
                                    text={"verbosity": "low"},
                                    max_output_tokens=fallback_max
                                )
                                if getattr(resp2, "output_text", None):
                                    return resp2.output_text
                                # Try structured extraction again
                                if hasattr(resp2, "output") and resp2.output:
                                    retry_chunks = []
                                    for item in resp2.output:
                                        content_list = getattr(item, "content", None)
                                        if content_list:
                                            for part in content_list:
                                                text_val = getattr(part, "text", None)
                                                if text_val:
                                                    retry_chunks.append(text_val)
                                    joined2 = "".join(retry_chunks).strip()
                                    if joined2:
                                        return joined2
                        # If still no text, treat as failure so caller can fallback to another provider
                        raise Exception("OpenAI Responses API returned no text output")
                    except Exception as e3:
                        raise Exception(
                            f"OpenAI API error after retries (max_completion_tokens + Responses API): {str(e3)}"
                        )
            raise Exception(f"OpenAI API error: {error_text}")


class AnthropicClient(LLMClient):
    """Anthropic API client."""
    
    def __init__(self, api_key: str, default_model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.default_model = default_model
    
    async def generate_response(
        self, 
        messages: List[ConversationMessage],
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: str = None
    ) -> str:
        """Generate response using Anthropic API."""
        
        # Separate system messages from conversation
        system_messages = [msg.content for msg in messages if msg.role == MessageRole.SYSTEM]
        conversation_messages = [msg for msg in messages if msg.role != MessageRole.SYSTEM]
        
        # Convert to Anthropic format
        anthropic_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in conversation_messages
        ]
        
        try:
            print(">>> [Anthropic] About to call Anthropic API")
            
            # Check if we need streaming (for long operations)
            use_streaming = max_tokens > 5000  # Use streaming for longer responses
            
            if use_streaming:
                print(">>> [Anthropic] Using streaming mode for long operation")
                return await self._generate_response_streaming(
                    model or self.default_model,
                    max_tokens,
                    temperature,
                    system_messages,
                    anthropic_messages
                )
            else:
                # Use regular non-streaming for shorter responses
                # Ensure budget_tokens meets Anthropic's minimum requirement of 1024
                budget_tokens = max(1024, min(2000, max_tokens // 2))
                max_tokens_for_call = max(max_tokens, budget_tokens + 1)
                
                response = await self.client.messages.create(
                    model=model or self.default_model,
                    max_tokens=max_tokens_for_call,
                    temperature=1.0,  # Temperature must be 1.0 when thinking is enabled
                    system="\n".join(system_messages) if system_messages else None,
                    messages=anthropic_messages,
                    thinking={
                        "type": "enabled",
                        "budget_tokens": budget_tokens
                    }
                )
                print("<<< [Anthropic] Anthropic API call returned")
                
                # Extract main output
                main_output = None
                if hasattr(response, 'content') and response.content:
                    for block in response.content:
                        if getattr(block, 'type', None) == 'thinking':
                            print("[Anthropic][Extended Thinking] Reasoning block:")
                            print(block.thinking)
                        elif getattr(block, 'type', None) == 'text':
                            if main_output is None:
                                main_output = block.text
                            print("[Anthropic][Text] Main output block:")
                            print(block.text)
                
                return main_output or ""
            
        except Exception as e:
            raise Exception(f"Anthropic API error: {str(e)}")
    
    async def _generate_response_streaming(
        self,
        model: str,
        max_tokens: int,
        temperature: float,
        system_messages: List[str],
        anthropic_messages: List[Dict[str, str]]
    ) -> str:
        """Generate response using streaming to handle long operations."""
        try:
            print(">>> [Anthropic] Starting streaming response")
            
            # For streaming, we'll use a simpler approach without thinking
            # to avoid the long operation issue
            stream = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system="\n".join(system_messages) if system_messages else None,
                messages=anthropic_messages,
                stream=True
            )
            
            full_response = ""
            async for chunk in stream:
                if chunk.type == "content_block_delta":
                    if hasattr(chunk.delta, 'text'):
                        full_response += chunk.delta.text
                        print(f"[Anthropic][Stream] {chunk.delta.text}", end="", flush=True)
            
            print("\n<<< [Anthropic] Streaming response completed")
            return full_response
            
        except Exception as e:
            raise Exception(f"Anthropic streaming error: {str(e)}")


class GeminiClient(LLMClient):
    """Google Gemini API client."""
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        self.api_key = api_key
        self.model = model
        genai.configure(api_key=api_key)
        self.model_obj = genai.GenerativeModel(model)

    async def generate_response(
        self,
        messages: List[ConversationMessage],
        max_tokens: int = 1000,
        temperature: float = 0.7
    ) -> str:
        """Generate response using Gemini API."""
        prompt = "\n".join([
            f"[{msg.role.value.upper()}] {msg.content}" for msg in messages
        ])
        try:
            print(">>> [Gemini] About to call Gemini API")
            # Gemini's SDK is sync, so run in thread with timeout
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.model_obj.generate_content,
                    prompt,
                    generation_config={
                        "max_output_tokens": max_tokens,
                        "temperature": temperature
                    }
                ),
                timeout=30.0  # 30 second timeout instead of 60
            )
            print("<<< [Gemini] Gemini API call returned")
            return response.text or ""
        except asyncio.TimeoutError:
            raise Exception("Gemini API call timed out after 30 seconds")
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")


class PerplexityClient(LLMClient):
    """Perplexity API client (OpenAI-compatible, v1.x interface)."""
    def __init__(self, api_key: str, model: str = "sonar-reasoning"):
        self.api_key = api_key
        self.model = model
        self.api_base = "https://api.perplexity.ai"

    async def generate_response(
        self,
        messages: List[ConversationMessage],
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: str = None
    ) -> str:
        import openai
        from openai import AsyncOpenAI
        openai_client = AsyncOpenAI(api_key=self.api_key, base_url="https://api.perplexity.ai")
        openai_model = model or self.model
        openai_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
        ]
        try:
            print(">>> [Perplexity] About to call Perplexity API (OpenAI v1.x)")
            response = await openai_client.chat.completions.create(
                model=openai_model,
                messages=openai_messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            print("<<< [Perplexity] Perplexity API call returned")
            return response.choices[0].message.content or ""
        except Exception as e:
            raise Exception(f"Perplexity API error: {str(e)}")


class UnifiedLLMClient:
    """
    Unified client that can route requests to different LLM providers.
    Implements load balancing and fallback strategies.
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.clients = {}
        
        # Initialize available clients
        if self.settings.openai_api_key:
            self.clients[LLMProvider.OPENAI] = OpenAIClient(
                self.settings.openai_api_key,
                getattr(self.settings, "openai_organization", None),
                getattr(self.settings, "openai_project", None),
                getattr(self.settings, "openai_model", "gpt-5-2025-08-07")
            )
            print(f"[LLM] OpenAI client initialized")
        
        if self.settings.anthropic_api_key:
            self.clients[LLMProvider.ANTHROPIC] = AnthropicClient(self.settings.anthropic_api_key)
            print(f"[LLM] Anthropic client initialized")

        # Gemini (Google Generative AI)
        google_api_key = self.settings.google_api_key or os.environ.get("GOOGLE_AI_KEY")
        if GEMINI_AVAILABLE and google_api_key:
            self.clients[LLMProvider.GOOGLE] = GeminiClient(google_api_key)
            print(f"[LLM] Gemini client initialized with model: gemini-1.5-flash")
        else:
            if not GEMINI_AVAILABLE:
                print(f"[LLM] Gemini not available - google-generativeai package not installed")
            if not google_api_key:
                print(f"[LLM] Gemini not available - GOOGLE_AI_KEY not set")
        
        if self.settings.perplexity_api_key:
            self.clients[LLMProvider.PERPLEXITY] = PerplexityClient(self.settings.perplexity_api_key, self.settings.perplexity_model)
            print(f"[LLM] Perplexity client initialized with model: {self.settings.perplexity_model}")
        
        print(f"[LLM] Available providers: {list(self.clients.keys())}")
    
    @staticmethod
    def _infer_provider_from_model(model_id: str | None) -> LLMProvider | None:
        if not model_id:
            return None
        mid = model_id.lower()
        if mid.startswith("claude") or "sonnet" in mid:
            return LLMProvider.ANTHROPIC
        if mid.startswith("gemini"):
            return LLMProvider.GOOGLE
        if mid.startswith("sonar") or "perplex" in mid:
            return LLMProvider.PERPLEXITY
        # Treat GPT, O-series, and nano as OpenAI
        if mid.startswith("gpt-") or mid.startswith("o3") or mid.startswith("o4") or "-nano" in mid:
            return LLMProvider.OPENAI
        return None

    async def generate_response(
        self,
        messages: List[ConversationMessage],
        preferred_provider: Optional[LLMProvider] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: str | None = None,
        attachments: list[str] | None = None,
        allow_fallback: bool = True,
    ) -> tuple[str, LLMProvider]:
        """
        Generate response with automatic provider selection and optional fallback.
        
        Returns:
            Tuple of (response_text, provider_used)
        """
        
        # If fallback is disabled, route to a single provider only and propagate errors
        if allow_fallback is False:
            # Choose provider: honor preferred when valid, else force OpenAI if available
            single_provider: Optional[LLMProvider]
            if preferred_provider in self.clients:
                single_provider = preferred_provider  # type: ignore[assignment]
            elif LLMProvider.OPENAI in self.clients:
                single_provider = LLMProvider.OPENAI
            else:
                raise Exception("No LLM providers configured (OpenAI required when fallback disabled)")

            async def call_provider(provider: LLMProvider):
                client = self.clients[provider]
                if provider == LLMProvider.OPENAI:
                    return await client.generate_response(messages, max_tokens, temperature, model, attachments), provider
                elif provider == LLMProvider.ANTHROPIC or provider == LLMProvider.PERPLEXITY:
                    return await client.generate_response(messages, max_tokens, temperature, model), provider
                else:
                    return await client.generate_response(messages, max_tokens, temperature), provider

            # Do not try any other providers if the single one fails
            print(f"[LLM] Using single provider (no fallback): {single_provider}")
            response, used = await call_provider(single_provider)
            return response, used

        # If a model is specified, infer the correct provider and prioritize it exclusively
        inferred = self._infer_provider_from_model(model)
        if inferred is not None:
            preferred_provider = inferred

        # Determine which provider to use
        providers_to_try: list[LLMProvider] = []
        if preferred_provider and preferred_provider in self.clients:
            providers_to_try = [preferred_provider]
        else:
            # Default order when nothing is specified
            if LLMProvider.GOOGLE in self.clients:
                providers_to_try.append(LLMProvider.GOOGLE)
            if LLMProvider.ANTHROPIC in self.clients:
                providers_to_try.append(LLMProvider.ANTHROPIC)
            if LLMProvider.OPENAI in self.clients:
                providers_to_try.append(LLMProvider.OPENAI)
            for provider in self.clients:
                if provider not in providers_to_try:
                    providers_to_try.append(provider)
        
        if not providers_to_try:
            raise Exception("No LLM providers configured")
        
        # Race first two providers for quickest response, fallback to sequential if both fail
        async def call_provider(provider: LLMProvider):
            client = self.clients[provider]
            if provider == LLMProvider.OPENAI:
                # OpenAI client supports model and attachments
                return await client.generate_response(messages, max_tokens, temperature, model, attachments), provider
            elif provider == LLMProvider.ANTHROPIC or provider == LLMProvider.PERPLEXITY:
                # These clients accept model as the last parameter (Perplexity) or within their implementation (Anthropic)
                return await client.generate_response(messages, max_tokens, temperature, model), provider
            else:
                # Gemini or others: no model override param
                return await client.generate_response(messages, max_tokens, temperature), provider

        last_error = None
        if len(providers_to_try) >= 2:
            first, second, *rest = providers_to_try
            try:
                # Bound the race to 35s to avoid hanging
                done, pending = await asyncio.wait(
                    {
                        asyncio.create_task(call_provider(first)),
                        asyncio.create_task(call_provider(second)),
                    },
                    timeout=35.0,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                if done:
                    result = await list(done)[0]
                    return result.result()
            except Exception as e:
                last_error = e
            # If race failed, try the rest sequentially including the non-winner of race
            sequential = [first, second] + rest
        else:
            sequential = providers_to_try

        for provider in sequential:
            try:
                print(f"[LLM] Trying provider: {provider}")
                response, used = await call_provider(provider)
                print(f"[LLM] Successfully used provider: {used}")
                return response, used
            except Exception as e:
                print(f"[LLM] Provider {provider} failed: {str(e)}")
                last_error = e
                continue

        raise Exception(f"All LLM providers failed. Last error: {last_error}")
    
    def get_available_providers(self) -> List[LLMProvider]:
        """Get list of available providers."""
        return list(self.clients.keys())


# Global client instance
_llm_client = None


def get_llm_client() -> UnifiedLLMClient:
    """Get the global LLM client instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = UnifiedLLMClient()
    return _llm_client 