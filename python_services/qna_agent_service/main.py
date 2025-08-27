"""
Q&A Agent Service - Main FastAPI application.
"""

import time
import os
from contextlib import asynccontextmanager
import asyncio
from typing import List, AsyncGenerator, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import shared modules
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from shared.models import (
    AgentRequest, AgentResponse, HealthCheck, ErrorResponse,
    ConversationMessage, MessageRole, LLMProvider
)
from shared.config import get_settings
from shared.llm_client import get_llm_client

# Import QnA agent - use absolute import to avoid relative import issues
from qna_agent_service.agent import QnAAgent
import httpx
import json
from qna_agent_service.document_context import _chunk_text_by_sentences
from shared.langchain_config import get_document_content
from shared.vector_db import get_vector_db
from typing import List
from io import BytesIO
from openai import AsyncOpenAI


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    # Startup
    print("Q&A Agent Service starting up...")
    
    # Initialize the agent
    app.state.qna_agent = QnAAgent()
    
    yield
    
    # Shutdown
    print("Q&A Agent Service shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Lucid Learn AI - Q&A Agent Service",
    description="Intelligent question and answer agent for personalized learning",
    version="0.1.0",
    lifespan=lifespan
)

# Add CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint."""
    settings = get_settings()
    return HealthCheck(
        service=f"qna-agent-{settings.service_name}",
        status="healthy"
    )


@app.get("/providers", response_model=List[str])
async def get_available_providers():
    """Get list of available LLM providers."""
    llm_client = get_llm_client()
    providers = llm_client.get_available_providers()
    return [provider.value for provider in providers]


@app.post("/ask", response_model=AgentResponse)
async def ask_question(request: AgentRequest):
    """
    Process a student's question and generate an educational response.
    """
    start_time = time.time()
    
    try:
        # Get the agent instance
        agent = app.state.qna_agent
        
        # Process the question
        response_text, provider_used = await agent.process_question(
            request.message,
            request.conversation_history,
            request.preferred_provider,
            request.context,
            user_id=request.user_id,
            session_id=request.session_id,
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return AgentResponse(
            session_id=request.session_id,
            response=response_text,
            confidence=0.85,  # Will be dynamic based on agent logic
            provider_used=provider_used,
            processing_time_ms=processing_time,
            metadata={
                "agent_type": "qna",
                "question_length": len(request.message),
                "has_context": request.context is not None
            }
        )
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        # Return an informative error payload to callers instead of raw 500
        raise HTTPException(status_code=502, detail=f"QnA upstream error: {str(e)}")


@app.post("/batch-ask", response_model=List[AgentResponse])
async def batch_ask_questions(requests: List[AgentRequest]):
    """
    Process multiple questions in batch for efficiency.
    """
    if len(requests) > 10:  # Reasonable limit
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 questions per batch request"
        )
    
    responses = []
    agent = app.state.qna_agent
    
    for request in requests:
        start_time = time.time()
        
        try:
            response_text, provider_used = await agent.process_question(
                request.message,
                request.conversation_history,
                request.preferred_provider,
                request.context
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            response = AgentResponse(
                session_id=request.session_id,
                response=response_text,
                confidence=0.85,
                provider_used=provider_used,
                processing_time_ms=processing_time
            )
            responses.append(response)
            
        except Exception as e:
            # For batch requests, we continue with other questions
            # but include error information
            responses.append(AgentResponse(
                session_id=request.session_id,
                response=f"Error processing question: {str(e)}",
                confidence=0.0,
                provider_used=LLMProvider.OPENAI,  # Default fallback
                processing_time_ms=0
            ))
    
    return responses


# -------------------- Perplexity Research (Streaming) --------------------

async def _perplexity_stream(
    *,
    query: str,
    conversation_history: Optional[List[ConversationMessage]] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> AsyncGenerator[bytes, None]:
    settings = get_settings()
    if not settings.perplexity_api_key:
        # Emit an error as a final SSE-like message
        yield b'{"type":"error","message":"PERPLEXITY_API_KEY not configured on service"}\n'
        return

    # Build messages array using OpenAI-style schema expected by Perplexity
    messages: List[Dict[str, Any]] = []
    if conversation_history:
        for msg in conversation_history:
            if isinstance(msg, dict):
                role = msg.get("role")
                content = msg.get("content")
            else:
                # Fallback for pydantic models
                role = getattr(msg, "role", None)
                if hasattr(role, "value"):
                    role = role.value
                content = getattr(msg, "content", None)
            if role and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": query})

    headers = {
        "Authorization": f"Bearer {settings.perplexity_api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": settings.perplexity_model or "sonar-reasoning",
        "messages": messages,
        "stream": True,
    }

    url = "https://api.perplexity.ai/chat/completions"

    # Stream from Perplexity and re-emit line-delimited JSON objects that are easy for clients to parse
    aggregated_content: str = ""
    aggregated_citations: list = []
    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                resp.raise_for_status()

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    # Perplexity uses SSE style lines starting with 'data: '
                    if line.startswith("data:"):
                        data_str = line[len("data:"):].strip()
                    else:
                        data_str = line.strip()

                    if data_str == "[DONE]":
                        # Emit final aggregate if available before done
                        if aggregated_content:
                            out_final = json.dumps({"type": "final", "content": aggregated_content}).encode("utf-8") + b"\n"
                            yield out_final
                        if aggregated_citations:
                            out_c = json.dumps({"type": "citations", "results": aggregated_citations}).encode("utf-8") + b"\n"
                            yield out_c
                        yield b'{"type":"done"}\n'
                        break

                    # Try to parse the SSE payload and extract incremental content
                    try:
                        event = json.loads(data_str)
                        # OpenAI-like delta tokens
                        delta = (
                            event.get("choices", [{}])[0]
                                 .get("delta", {})
                                 .get("content")
                        )
                        if delta:
                            aggregated_content += delta
                            out = json.dumps({"type": "content", "delta": delta}).encode("utf-8") + b"\n"
                            yield out

                        # Some providers emit complete message objects mid-stream
                        message_content = (
                            event.get("choices", [{}])[0]
                                 .get("message", {})
                                 .get("content")
                        )
                        if message_content and not delta:
                            aggregated_content += message_content
                            outm = json.dumps({"type": "content", "delta": message_content}).encode("utf-8") + b"\n"
                            yield outm

                        # If Perplexity emits citations/search results in streaming meta
                        if "search_results" in event:
                            results = event.get("search_results", [])
                            if isinstance(results, list):
                                aggregated_citations.extend(results)
                                out = json.dumps({
                                    "type": "citations",
                                    "results": results,
                                }).encode("utf-8") + b"\n"
                                yield out
                    except Exception:
                        # Forward raw line for debugging
                        yield json.dumps({"type": "raw", "data": data_str}).encode("utf-8") + b"\n"
        except httpx.HTTPError as e:
            yield json.dumps({"type": "error", "message": str(e)}).encode("utf-8") + b"\n"


@app.post("/research/stream")
async def research_stream(request: Request):
    """
    Streaming research endpoint powered by Perplexity Sonar Deep Research.
    Returns newline-delimited JSON objects: {type: content|citations|raw|error|done, ...}
    """
    body = await request.json()
    query: str = body.get("query") or body.get("message") or ""
    if not query:
        raise HTTPException(status_code=400, detail="Missing 'query' in request body")

    conversation_history = body.get("conversation_history") or body.get("history")
    user_id = body.get("user_id")
    session_id = body.get("session_id")

    generator = _perplexity_stream(
        query=query,
        conversation_history=conversation_history,
        user_id=user_id,
        session_id=session_id,
    )

    return StreamingResponse(generator, media_type="text/plain; charset=utf-8")


@app.post("/ask/stream")
async def ask_stream(request: Request):
    """
    Stream Q&A responses as newline-delimited JSON events.
    Events:
      - {type: "status"|"keepalive", message?}
      - {type: "provider", provider}
      - {type: "content", delta}
      - {type: "final", content}
      - {type: "error", message}
      - {type: "done"}
    """
    body = await request.json()
    session_id: str = body.get("session_id") or body.get("sessionId")
    user_id: str = body.get("user_id") or body.get("userId")
    message: str = body.get("message") or body.get("query") or ""
    conversation_history = body.get("conversation_history") or body.get("conversationHistory") or []
    preferred_provider = body.get("preferred_provider") or body.get("preferredProvider")
    context = body.get("context") or {}

    if not session_id or not user_id or not message:
        raise HTTPException(status_code=400, detail="Missing 'session_id', 'user_id' or 'message'")

    # Normalize conversation history into ConversationMessage objects
    normalized_history: List[ConversationMessage] = []
    try:
        if isinstance(conversation_history, list):
            for item in conversation_history:
                if isinstance(item, ConversationMessage):
                    normalized_history.append(item)
                elif isinstance(item, dict):
                    role_val = item.get("role")
                    content_val = item.get("content")
                    if role_val and content_val:
                        try:
                            role_enum = MessageRole(role_val)
                        except Exception:
                            # Fallback: coerce to user/assistant/system if possible
                            role_enum = MessageRole.USER if str(role_val).lower() not in {"assistant", "system"} else MessageRole(str(role_val).lower())
                        normalized_history.append(ConversationMessage(role=role_enum, content=str(content_val)))
        # Guard length
        if len(normalized_history) > 50:
            normalized_history = normalized_history[-50:]
    except Exception:
        normalized_history = []

    # Normalize preferred provider into enum if provided
    preferred_provider_enum = None
    try:
        if preferred_provider is not None:
            if isinstance(preferred_provider, LLMProvider):
                preferred_provider_enum = preferred_provider
            elif isinstance(preferred_provider, str):
                preferred_provider_enum = LLMProvider(preferred_provider)
    except Exception:
        preferred_provider_enum = None

    async def _generator() -> AsyncGenerator[bytes, None]:
        # Initial status
        yield b'{"type":"status","message":"processing"}\n'

        agent: QnAAgent = app.state.qna_agent

        # Prepare messages and options for potential streaming
        try:
            messages, desired_model, attachment_file_ids, enriched_context = await agent.prepare_for_stream(
                question=message,
                conversation_history=normalized_history,
                context=context,
                user_id=user_id,
                session_id=session_id,
            )
        except Exception as prep_e:
            # Fallback to non-streaming path if preparation fails
            messages, desired_model, attachment_file_ids, enriched_context = [], None, [], (context or {})

        # Decide streaming path: Prefer OpenAI true streaming when possible
        settings = get_settings()
        use_openai_stream = bool(settings.openai_api_key)
        if preferred_provider_enum is not None:
            use_openai_stream = use_openai_stream and (preferred_provider_enum == LLMProvider.OPENAI)
        else:
            # If no explicit provider, stream with OpenAI when model hints at GPT or default
            lid = (desired_model or "").lower()
            use_openai_stream = use_openai_stream and ("gpt" in lid or lid == "" or lid is None)

        if use_openai_stream and messages:
            # Try OpenAI streaming. Prefer Responses API for GPT-5/nano/thinking models; else fallback to Chat Completions streaming.
            try:
                # Notify provider early
                yield b'{"type":"provider","provider":"openai"}\n'

                client_kwargs = {"api_key": settings.openai_api_key}
                if getattr(settings, "openai_organization", None):
                    client_kwargs["organization"] = settings.openai_organization
                if getattr(settings, "openai_project", None):
                    client_kwargs["project"] = settings.openai_project
                openai_client = AsyncOpenAI(**client_kwargs)

                # Convert messages to OpenAI format
                openai_messages = []
                for m in messages:
                    try:
                        role_val = getattr(getattr(m, "role", None), "value", None) or getattr(m, "role", None)
                        content_val = getattr(m, "content", None)
                        if role_val and content_val:
                            openai_messages.append({"role": role_val, "content": content_val})
                    except Exception:
                        pass

                model_id = desired_model or getattr(settings, "openai_model", None) or "gpt-5-2025-08-07"

                def _is_responses_first_model(model_name: str) -> bool:
                    lid = (model_name or "").lower()
                    return ("gpt-5" in lid) or ("-nano" in lid) or ("thinking" in lid)

                accumulated = []
                if _is_responses_first_model(model_id):
                    # Build Responses API input; include attachments when provided via context
                    input_payload: Any
                    if attachment_file_ids:
                        # Join prior messages to a single input_text block, then add input_file parts
                        user_text = "\n".join([
                            f"[{(msg.role.value if hasattr(msg.role, 'value') else str(msg.role)).upper()}] {msg.content}"
                            for msg in messages
                        ])
                        input_payload = [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "input_text", "text": user_text},
                                    *[{"type": "input_file", "file_id": fid} for fid in attachment_file_ids if isinstance(fid, str)],
                                ],
                            }
                        ]
                    else:
                        input_payload = "\n".join([
                            f"[{(msg.role.value if hasattr(msg.role, 'value') else str(msg.role)).upper()}] {msg.content}"
                            for msg in messages
                        ])

                    # Stream via Responses API (proper async context manager)
                    async with openai_client.responses.stream(
                        model=model_id,
                        input=input_payload,
                        reasoning={"effort": "low"},
                        text={"verbosity": "low"},
                        max_output_tokens=1200,
                    ) as stream:
                        async for event in stream:
                            try:
                                etype = getattr(event, "type", None) or (event.get("type") if isinstance(event, dict) else None)
                                if etype == "response.output_text.delta":
                                    piece = getattr(event, "delta", None) or (event.get("delta") if isinstance(event, dict) else None)
                                    if piece:
                                        accumulated.append(piece)
                                        yield json.dumps({"type": "content", "delta": piece}).encode("utf-8") + b"\n"
                            except Exception:
                                pass
                else:
                    # Stream via Chat Completions API
                    try:
                        stream = await openai_client.chat.completions.create(
                            model=model_id,
                            messages=openai_messages,
                            temperature=0.7,
                            stream=True,
                            max_tokens=1200,
                        )
                    except Exception:
                        # Retry with newer param for newer models
                        stream = await openai_client.chat.completions.create(
                            model=model_id,
                            messages=openai_messages,
                            temperature=0.7,
                            stream=True,
                            max_completion_tokens=1200,
                        )

                    async for chunk in stream:  # type: ignore[attr-defined]
                        try:
                            choices = getattr(chunk, "choices", None) or []
                            if choices:
                                delta = getattr(choices[0], "delta", None)
                                if delta is None:
                                    delta = getattr(getattr(choices[0], "message", None), "content", None)
                                text_piece = None
                                if delta is not None and hasattr(delta, "content"):
                                    text_piece = getattr(delta, "content", None)
                                elif isinstance(delta, dict):
                                    text_piece = delta.get("content")
                                elif isinstance(delta, str):
                                    text_piece = delta
                                if text_piece:
                                    accumulated.append(text_piece)
                                    yield json.dumps({"type": "content", "delta": text_piece}).encode("utf-8") + b"\n"
                        except Exception:
                            pass

                full_text = "".join(accumulated)
                yield json.dumps({"type": "final", "content": full_text}).encode("utf-8") + b"\n"
                yield b'{"type":"done"}\n'

                # Best-effort memory persistence (non-blocking)
                if user_id and full_text:
                    try:
                        asyncio.create_task(agent.memory_store.add_interaction(
                            user_id=user_id,
                            session_id=session_id or "",
                            question=message,
                            answer=full_text,
                            metadata={
                                "docId": (enriched_context or {}).get("docId"),
                                "documentTitle": (enriched_context or {}).get("documentTitle"),
                                "source": (enriched_context or {}).get("source"),
                            },
                        ))
                    except Exception:
                        pass
                return
            except Exception as stream_e:
                # Fall back to compute-then-slice path below
                yield json.dumps({"type": "status", "message": f"fallback_non_streaming: {str(stream_e)}"}).encode("utf-8") + b"\n"

        # Default fallback: compute entire response then slice into deltas
        task = asyncio.create_task(agent.process_question(
            message,
            normalized_history,
            preferred_provider_enum,
            context,
            user_id=user_id,
            session_id=session_id,
        ))

        # Emit keepalives while computing
        while not task.done():
            await asyncio.sleep(0.25)
            yield b'{"type":"keepalive"}\n'

        try:
            response_text, provider_used = await task
            # Provider info
            try:
                yield json.dumps({"type": "provider", "provider": getattr(provider_used, "value", str(provider_used))}).encode("utf-8") + b"\n"
            except Exception:
                pass

            # Stream the content in small chunks for progressive UI updates
            def _chunks(text: str, size: int = 64):
                for i in range(0, len(text), size):
                    yield text[i:i+size]

            accumulated = []
            for piece in _chunks(response_text, 96):
                accumulated.append(piece)
                yield json.dumps({"type": "content", "delta": piece}).encode("utf-8") + b"\n"

            full_content = "".join(accumulated) if accumulated else response_text
            yield json.dumps({"type": "final", "content": full_content}).encode("utf-8") + b"\n"
            yield b'{"type":"done"}\n'
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}).encode("utf-8") + b"\n"

    # Prevent intermediaries from buffering the stream
    return StreamingResponse(
        _generator(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/ingest")
async def ingest_document(request: Request):
    """
    Ingest a focused document into the vector database for a given user.
    Accepts either a doc_id resolvable by the content service or a direct document_url.
    """
    body = await request.json()
    user_id: str = body.get("user_id")
    doc_id: str = body.get("doc_id")
    document_url: str = body.get("document_url")
    document_title: str = body.get("document_title") or ""
    background_index: bool = bool(body.get("background_index", True))
    skip_vdb_if_openai: bool = bool(body.get("skip_vdb_if_openai", True))

    if not user_id or not doc_id:
        raise HTTPException(status_code=400, detail="Missing 'user_id' or 'doc_id'")

    collection_name = f"{user_id}_doc_{doc_id}"
    total_chunks = 0
    tried_url = False
    uploaded = False
    openai_file_id: str | None = None
    indexing_mode: str = "none"

    try:
        vdb = await get_vector_db()

        # Priority 1: Direct OpenAI upload of the raw PDF (for GPT-5 grounding)
        if document_url:
            tried_url = True
            extracted_text = ""
            page_texts: List[str] = []
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(document_url)
                resp.raise_for_status()
                data = resp.content or b""
                ctype = resp.headers.get("Content-Type", "application/octet-stream").lower()

            # Try OpenAI Files upload first (size/type guard)
            try:
                settings = get_settings()
                if settings.openai_api_key and data:
                    size_mb = len(data) / (1024 * 1024)
                    if size_mb <= 20 and ("pdf" in ctype or document_url.lower().endswith(".pdf")):
                        print(f"[INGEST] Uploading to OpenAI Files (size={size_mb:.2f}MB, type={ctype})...")
                        openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
                        try:
                            up = await asyncio.wait_for(
                                openai_client.files.create(
                                    file=(f"{doc_id}.pdf", data, "application/pdf"),
                                    purpose="assistants",
                                ),
                                timeout=25.0,
                            )
                        except Exception as e_upload:
                            print(f"[INGEST] 'assistants' upload error, retrying with 'user_data': {e_upload}")
                            up = await asyncio.wait_for(
                                openai_client.files.create(
                                    file=(f"{doc_id}.pdf", data, "application/pdf"),
                                    purpose="user_data",
                                ),
                                timeout=25.0,
                            )
                        openai_file_id = getattr(up, "id", None) or (up.get("id") if isinstance(up, dict) else None)
                        if openai_file_id:
                            print(f"[INGEST] OpenAI upload successful. file_id={openai_file_id}")
                            uploaded = True  # Mark uploaded based on successful AI upload
                        else:
                            print("[INGEST] OpenAI upload returned no id; continuing with text extraction.")
            except Exception as e:
                print(f"[INGEST] OpenAI upload failed: {e}")
            # If OpenAI upload succeeded and we are configured to skip or background index, handle fast-path
            if openai_file_id and skip_vdb_if_openai:
                if background_index:
                    indexing_mode = "background"
                    async def _background_index(pdf_bytes: bytes):
                        try:
                            import PyPDF2  # type: ignore
                            local_total = 0
                            pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_bytes))
                            documents_payload_bg: List[dict] = []
                            for page_index, page in enumerate(pdf_reader.pages, start=1):
                                try:
                                    txt = page.extract_text() or ""
                                except Exception:
                                    txt = ""
                                if not txt:
                                    continue
                                for i, chunk in enumerate(_chunk_text_by_sentences(txt)):
                                    documents_payload_bg.append({
                                        "id": f"{doc_id}_p{page_index}_{i}",
                                        "content": chunk,
                                        "metadata": {
                                            "docId": doc_id,
                                            "documentTitle": document_title,
                                            "source": "read_document",
                                            "ingest": "direct_url",
                                            "page": page_index,
                                        },
                                    })
                                # Optional: throttle to first N pages for very large docs
                                if len(documents_payload_bg) > 2000:
                                    break
                            if documents_payload_bg:
                                try:
                                    await vdb.add_documents(documents=documents_payload_bg, collection_name=collection_name)
                                except Exception as e_bg:
                                    print(f"[INGEST][BG] VDB add failed: {e_bg}")
                        except Exception as e_bg:
                            print(f"[INGEST][BG] Background index failed: {e_bg}")
                    # Fire and forget
                    asyncio.create_task(_background_index(data))
                else:
                    indexing_mode = "skipped"
                # Fast return if we’re done with upload and skipping immediate VDB
                return {
                    "status": "ok",
                    "uploaded": True,
                    "doc_id": doc_id,
                    "user_id": user_id,
                    "collection": collection_name,
                    "chunks": 0,
                    "tried_url": tried_url,
                    "openai_file_id": openai_file_id,
                    "indexing": indexing_mode,
                }

            # If OpenAI upload did not happen and background indexing is requested,
            # perform extraction and VDB add in the background to avoid request timeouts.
            if background_index:
                indexing_mode = "background"
                async def _background_extract_and_index(pdf_bytes: bytes, content_type: str):
                    try:
                        import PyPDF2  # type: ignore
                        page_texts_local: List[str] = []
                        try:
                            pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_bytes))
                            for page in pdf_reader.pages:
                                try:
                                    txt = page.extract_text() or ""
                                except Exception:
                                    txt = ""
                                if txt:
                                    page_texts_local.append(txt)
                        except Exception:
                            page_texts_local = []
                        extracted_text_local = "\n\n".join([t for t in page_texts_local if t])
                        if not extracted_text_local:
                            try:
                                extracted_text_local = pdf_bytes.decode("utf-8", errors="ignore")
                            except Exception:
                                extracted_text_local = ""
                        documents_payload_bg: List[dict] = []
                        if page_texts_local:
                            for page_index, page_text in enumerate(page_texts_local, start=1):
                                if not page_text:
                                    continue
                                page_chunks = _chunk_text_by_sentences(page_text)
                                for i, chunk in enumerate(page_chunks):
                                    documents_payload_bg.append({
                                        "id": f"{doc_id}_p{page_index}_{i}",
                                        "content": chunk,
                                        "metadata": {
                                            "docId": doc_id,
                                            "documentTitle": document_title,
                                            "source": "read_document",
                                            "ingest": "direct_url",
                                            "page": page_index,
                                        },
                                    })
                        elif extracted_text_local:
                            chunks = _chunk_text_by_sentences(extracted_text_local)
                            documents_payload_bg = [
                                {
                                    "id": f"{doc_id}_{i}",
                                    "content": chunk,
                                    "metadata": {
                                        "docId": doc_id,
                                        "documentTitle": document_title,
                                        "source": "read_document",
                                        "ingest": "direct_url",
                                    },
                                }
                                for i, chunk in enumerate(chunks)
                            ]
                        if documents_payload_bg:
                            try:
                                await vdb.add_documents(documents=documents_payload_bg, collection_name=collection_name)
                            except Exception as e_bg:
                                print(f"[INGEST][BG] VDB add failed: {e_bg}")
                    except Exception as e_bg:
                        print(f"[INGEST][BG] Background extract/index failed: {e_bg}")
                asyncio.create_task(_background_extract_and_index(data, ctype))
                uploaded = True
                return {
                    "status": "ok",
                    "uploaded": True,
                    "doc_id": doc_id,
                    "user_id": user_id,
                    "collection": collection_name,
                    "chunks": 0,
                    "tried_url": tried_url,
                    "openai_file_id": openai_file_id,
                    "indexing": indexing_mode,
                }

            # Otherwise proceed with synchronous text extraction + VDB indexing (older behavior)
            try:
                import PyPDF2  # type: ignore
                pdf_reader = PyPDF2.PdfReader(BytesIO(data))
                for page in pdf_reader.pages:
                    try:
                        txt = page.extract_text() or ""
                    except Exception:
                        txt = ""
                    page_texts.append(txt)
                extracted_text = "\n\n".join([t for t in page_texts if t])
            except Exception:
                extracted_text = ""

            if not extracted_text:
                try:
                    extracted_text = data.decode("utf-8", errors="ignore")
                except Exception:
                    extracted_text = ""

            documents_payload: List[dict] = []
            if page_texts:
                for page_index, page_text in enumerate(page_texts, start=1):
                    if not page_text:
                        continue
                    page_chunks = _chunk_text_by_sentences(page_text)
                    for i, chunk in enumerate(page_chunks):
                        documents_payload.append({
                            "id": f"{doc_id}_p{page_index}_{i}",
                            "content": chunk,
                            "metadata": {
                                "docId": doc_id,
                                "documentTitle": document_title,
                                "source": "read_document",
                                "ingest": "direct_url",
                                "page": page_index,
                            },
                        })
            elif extracted_text:
                chunks = _chunk_text_by_sentences(extracted_text)
                documents_payload = [
                    {
                        "id": f"{doc_id}_{i}",
                        "content": chunk,
                        "metadata": {
                            "docId": doc_id,
                            "documentTitle": document_title,
                            "source": "read_document",
                            "ingest": "direct_url",
                        },
                    }
                    for i, chunk in enumerate(chunks)
                ]

            if documents_payload:
                try:
                    await vdb.add_documents(documents=documents_payload, collection_name=collection_name)
                    total_chunks += len(documents_payload)
                    if not uploaded:
                        uploaded = True
                except Exception as e:
                    print(f"[INGEST] VDB add failed: {e}")

        # If we did not have a document_url or upload failed, still try the content service by doc_id
        if not tried_url:
            try:
                doc = await get_document_content(doc_id=doc_id, user_id=user_id)
                full_text: str = (doc or {}).get("content") or ""
                if full_text and background_index:
                    indexing_mode = "background"
                    async def _background_index_from_text(text: str):
                        try:
                            chunks = _chunk_text_by_sentences(text)
                            documents_payload = [
                                {
                                    "id": f"{doc_id}_{i}",
                                    "content": chunk,
                                    "metadata": {
                                        "docId": doc_id,
                                        "documentTitle": document_title,
                                        "source": "read_document",
                                        "ingest": "processor",
                                    },
                                }
                                for i, chunk in enumerate(chunks)
                            ]
                            if documents_payload:
                                await vdb.add_documents(documents=documents_payload, collection_name=collection_name)
                        except Exception as e_bg:
                            print(f"[INGEST][BG] Processor background index failed: {e_bg}")
                    asyncio.create_task(_background_index_from_text(full_text))
                    uploaded = True
                    return {
                        "status": "ok",
                        "uploaded": True,
                        "doc_id": doc_id,
                        "user_id": user_id,
                        "collection": collection_name,
                        "chunks": 0,
                        "tried_url": tried_url,
                        "openai_file_id": openai_file_id,
                        "indexing": indexing_mode,
                    }
                if full_text:
                    chunks = _chunk_text_by_sentences(full_text)
                    documents_payload = [
                        {
                            "id": f"{doc_id}_{i}",
                            "content": chunk,
                            "metadata": {
                                "docId": doc_id,
                                "documentTitle": document_title,
                                "source": "read_document",
                                "ingest": "processor",
                            },
                        }
                        for i, chunk in enumerate(chunks)
                    ]
                    if documents_payload:
                        await vdb.add_documents(documents=documents_payload, collection_name=collection_name)
                        total_chunks += len(documents_payload)
                        if not uploaded:
                            uploaded = True
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {
        "status": "ok" if uploaded else "skipped",
        "uploaded": uploaded,
        "doc_id": doc_id,
        "user_id": user_id,
        "collection": collection_name,
        "chunks": total_chunks,
        "tried_url": tried_url,
        "openai_file_id": openai_file_id,
        "indexing": indexing_mode or ("completed" if total_chunks > 0 else "none"),
    }

if __name__ == "__main__":
    settings = get_settings()
    # Get QnA service port - default to 8001 if not set
    qna_port = int(os.getenv("QNA_SERVICE_PORT", "8001"))
    
    uvicorn.run(
        "qna_agent_service.main:app",
        host="0.0.0.0",
        port=qna_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    ) 