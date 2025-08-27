"""
Document Processing Service - FastAPI Microservice
Handles file uploads, content extraction, and vector storage
"""

import os
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
import asyncio
import time
from datetime import datetime
from contextlib import asynccontextmanager
from enum import Enum

# Import our custom modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from shared.file_utils import FileProcessor, DocumentChunker
from shared.vector_db import get_vector_db, VectorDatabase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Application state
class ServiceState(Enum):
    NOT_INITIALIZED = "not_initialized"
    INITIALIZING = "initializing"
    HEALTHY = "healthy"
    FAILED = "failed"

app_state: Dict[str, Any] = {
    "state": ServiceState.NOT_INITIALIZED,
    "message": "Service is starting up.",
    "file_processor": None,
    "document_chunker": None,
    "vector_db": None,
    "processing_status": {},
    "document_content": {},
    "initialization_event": asyncio.Event()
}

# Pydantic models
class ProcessingStatus(BaseModel):
    file_id: str
    status: str
    progress: float
    message: str
    processed_at: Optional[str] = None
    full_text: Optional[str] = None

class DocumentInfo(BaseModel):
    file_id: str
    original_filename: str
    file_size: int
    mime_type: str
    pages: int
    word_count: int
    upload_timestamp: str
    processing_status: str

class SearchRequest(BaseModel):
    query: str
    collection_name: str = "default"
    top_k: int = 5
    user_id: Optional[str] = None

class SearchResult(BaseModel):
    results: List[Dict[str, Any]]
    query: str
    total_found: int
    search_time_ms: float

async def load_models_background():
    """Load heavy AI models in the background after startup."""
    try:
        logger.info("Starting background initialization of AI models...")
        app_state["state"] = ServiceState.INITIALIZING
        app_state["message"] = "Initializing AI models. This may take a few minutes."

        storage_path = os.getenv('FILE_STORAGE_PATH', './storage/documents')
        app_state["file_processor"] = FileProcessor(storage_path)
        logger.info("File processor initialized.")

        chunk_size = int(os.getenv('CHUNK_SIZE', '1000'))
        chunk_overlap = int(os.getenv('CHUNK_OVERLAP', '200'))
        app_state["document_chunker"] = DocumentChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        logger.info("Document chunker initialized.")
        
        app_state["vector_db"] = await get_vector_db()
        logger.info("Vector database initialized.")

        app_state["state"] = ServiceState.HEALTHY
        app_state["message"] = "Service is fully initialized and ready."
        logger.info("✅ Document Processing Service background initialization complete.")
        
    except Exception as e:
        app_state["state"] = ServiceState.FAILED
        app_state["message"] = f"A critical error occurred during model loading: {e}"
        logger.exception("❌ Background initialization failed.", exc_info=e)
    
    finally:
        app_state["initialization_event"].set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan with background model loading."""
    logger.info("Document Processing Service starting up...")
    asyncio.create_task(load_models_background())
    yield
    logger.info("Document Processing Service shutting down.")

# Initialize FastAPI app
app = FastAPI(
    title="Document Processing Service",
    description="AI-powered document processing and vector storage service",
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

async def models_ready():
    """Dependency to ensure models are loaded before processing requests."""
    if app_state["state"] != ServiceState.HEALTHY:
        await app_state["initialization_event"].wait()
        if app_state["state"] != ServiceState.HEALTHY:
            raise HTTPException(
                status_code=503, 
                detail=f"Service is not ready or failed to initialize: {app_state['message']}"
            )

@app.get("/")
async def root():
    """Root endpoint for basic service info."""
    return {
        "service": "Document Processing Service",
        "status": app_state["state"].value,
        "version": "1.0.0",
        "message": app_state["message"],
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check for orchestration."""
    current_state = app_state["state"]
    
    if current_state == ServiceState.HEALTHY:
        status_code = 200
        response = {
            "service": "document_processor",
            "status": "healthy",
            "message": app_state["message"],
            "components": {
                "file_processor": "healthy",
                "vector_db": "healthy",
                "document_chunker": "healthy"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    elif current_state == ServiceState.INITIALIZING:
        status_code = 200
        response = {
            "service": "document_processor",
            "status": "starting",
            "message": app_state["message"],
            "timestamp": datetime.utcnow().isoformat()
        }
    else:
        status_code = 503
        response = {
            "service": "document_processor",
            "status": "unhealthy",
            "error": app_state["message"],
            "timestamp": datetime.utcnow().isoformat()
        }
    
    return JSONResponse(content=response, status_code=status_code)

@app.post("/upload", response_model=ProcessingStatus)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Form(...),
    collection_name: str = Form("default"),
    ready: None = Depends(models_ready)
):
    """Upload and process a document."""
    try:
        # Debug logging
        logger.info(f"📤 Upload request received:")
        logger.info(f"  file type: {type(file)}")
        logger.info(f"  file filename: {getattr(file, 'filename', 'NO_FILENAME')}")
        logger.info(f"  file content_type: {getattr(file, 'content_type', 'NO_CONTENT_TYPE')}")
        logger.info(f"  user_id: {user_id}")
        logger.info(f"  collection_name: {collection_name}")
        
        file_content = await file.read()
        if not file.filename or len(file_content) == 0:
            raise HTTPException(status_code=400, detail="Invalid file provided")
        
        temp_file_id = f"temp_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}"
        app_state["processing_status"][temp_file_id] = ProcessingStatus(
            file_id=temp_file_id, 
            status="uploading", 
            progress=0.0,
            message="File upload received, starting processing..."
        )
        
        # Start processing immediately
        background_tasks.add_task(
            process_document_background, 
            file_content, 
            file.filename,
            user_id, 
            collection_name, 
            temp_file_id
        )
        
        # Quick response to client
        logger.info(f"File upload initiated: {file.filename} for user {user_id}")
        
        # Update status to show active processing
        app_state["processing_status"][temp_file_id].status = "processing"
        app_state["processing_status"][temp_file_id].progress = 5.0
        app_state["processing_status"][temp_file_id].message = "Processing started..."
        
        return app_state["processing_status"][temp_file_id]
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

async def process_document_background(
    file_content: bytes, filename: str, user_id: str,
    collection_name: str, temp_file_id: str
):
    """Background task for document processing with optimized performance."""
    file_processor = app_state["file_processor"]
    document_chunker = app_state["document_chunker"]
    vector_db = app_state["vector_db"]
    processing_status = app_state["processing_status"]
    actual_file_id = None

    try:
        status = processing_status[temp_file_id]
        
        # Step 1: Quick file save and initial processing (10-20%)
        status.status = "processing"
        status.progress = 10.0
        status.message = "Saving and analyzing document..."
        
        processed_result = await file_processor.process_upload(file_content, filename, user_id)
        actual_file_id = processed_result['file_id']
        
        # Store the extracted content
        extracted_text = processed_result['content']['content']
        app_state["document_content"][temp_file_id] = extracted_text
        
        # Quick update
        status.progress = 20.0
        status.message = f"Document analyzed ({processed_result['content']['pages']} pages)"
        
        # Step 2: Smart chunking with size optimization (20-40%)
        status.progress = 25.0
        status.message = "Creating optimized document chunks..."
        
        # Use smaller chunks for faster processing
        chunker = DocumentChunker(chunk_size=500, chunk_overlap=100)  # Reduced from 1000/200
        chunks = await chunker.chunk_document(extracted_text, processed_result['metadata'])
        
        status.progress = 35.0
        status.message = f"Created {len(chunks)} chunks, preparing embeddings..."
        
        # Step 3: Batch embedding generation with progress updates (40-90%)
        # Process in smaller batches for better progress feedback
        batch_size = 10  # Process 10 chunks at a time
        total_chunks = len(chunks)
        processed_chunks = 0
        
        for i in range(0, total_chunks, batch_size):
            batch_chunks = chunks[i:i+batch_size]
            
            # Update progress for each batch
            progress = 40 + (50 * processed_chunks / total_chunks)
            status.progress = progress
            status.message = f"Processing embeddings... {processed_chunks}/{total_chunks} chunks"
            
            # Add metadata to chunks
            for chunk in batch_chunks:
                chunk['metadata']['source_file_id'] = actual_file_id
            
            # Store batch embeddings
            await vector_db.store_embeddings(
                documents=[c['content'] for c in batch_chunks],
                metadata=[c['metadata'] for c in batch_chunks],
                collection_name=f"{user_id}_{collection_name}"
            )
            
            processed_chunks += len(batch_chunks)
            
            # Small delay to allow UI updates
            await asyncio.sleep(0.1)
        
        # Step 4: Finalize (90-100%)
        status.status = "completed"
        status.progress = 100.0
        status.message = f"✓ Document processed successfully! {total_chunks} chunks indexed."
        status.processed_at = datetime.utcnow().isoformat()
        
        logger.info(f"Document processing completed: {filename} (job: {temp_file_id}, file: {actual_file_id})")
        
    except Exception as e:
        if temp_file_id in processing_status:
            processing_status[temp_file_id].status = "error"
            processing_status[temp_file_id].progress = 0.0
            processing_status[temp_file_id].message = f"Processing failed: {str(e)}"
        logger.exception(f"Document processing error for {filename} (job: {temp_file_id})", exc_info=e)

@app.get("/status/{file_id}", response_model=ProcessingStatus)
async def get_processing_status(file_id: str):
    """Get the processing status of a file."""
    status = app_state["processing_status"].get(file_id)
    if not status:
        raise HTTPException(status_code=404, detail="File ID not found")
    
    # If completed, include the full text in the response
    if status.status == 'completed':
        content = app_state.get("document_content", {}).get(file_id)
        # Create a copy to avoid modifying the original state
        status_copy = status.model_copy(deep=True)
        status_copy.full_text = content
        return status_copy

    return status

@app.post("/search", response_model=SearchResult)
async def search_documents(request: SearchRequest, ready: None = Depends(models_ready)):
    """Search for relevant documents in the vector database."""
    try:
        start_time = time.time()
        search_results = await app_state["vector_db"].similarity_search_with_retrieval(
            query=request.query,
            collection_name=f"{request.user_id}_{request.collection_name}",
            top_k=request.top_k
        )
        end_time = time.time()
        
        return SearchResult(
            results=search_results, query=request.query,
            total_found=len(search_results), search_time_ms=(end_time - start_time) * 1000
        )
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents/{user_id}", response_model=List[DocumentInfo])
async def list_user_documents(user_id: str, ready: None = Depends(models_ready)):
    """List all documents processed for a specific user."""
    try:
        user_files_info = app_state["file_processor"].get_user_files(user_id)
        enriched_files = []
        for file_info in user_files_info:
            status_info = app_state["processing_status"].get(file_info['file_id'])
            file_info['processing_status'] = status_info.status if status_info else 'unknown'
            enriched_files.append(DocumentInfo(**file_info))
        return enriched_files
    except Exception as e:
        logger.error(f"Failed to list documents for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list documents")

@app.delete("/documents/{file_id}")
async def delete_document(file_id: str, user_id: str, ready: None = Depends(models_ready)):
    """Delete a document and its associated vectors."""
    try:
        doc_info = app_state["file_processor"].get_document_info(file_id)
        if not doc_info:
            raise HTTPException(status_code=404, detail="Document metadata not found.")
            
        collection_name = f"{user_id}_default"
        await app_state["vector_db"].delete_collection(collection_name)
        app_state["file_processor"].delete_file(file_id)
        
        if file_id in app_state["processing_status"]:
            del app_state["processing_status"][file_id]
        
        return {"message": "Document and associated vectors deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting document {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {e}")

if __name__ == "__main__":
    port = int(os.getenv("DOCUMENT_PROCESSOR_PORT", "8002"))
    host = os.getenv("DOCUMENT_PROCESSOR_HOST", "0.0.0.0")
    
    logger.info(f"Starting Document Processing Service on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    ) 