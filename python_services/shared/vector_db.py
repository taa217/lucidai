"""
Vector Database Interface for Document Embeddings
Provides ChromaDB integration for similarity search and document storage
"""

import os
import logging
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod
import asyncio

# Vector database imports
try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logging.warning("ChromaDB not available - vector operations will be disabled")

# Embedding imports
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDING_AVAILABLE = True
except ImportError:
    EMBEDDING_AVAILABLE = False
    logging.warning("sentence-transformers not available - embedding operations will be disabled")

try:
    from openai import AsyncOpenAI  # type: ignore
    OPENAI_SDK_AVAILABLE = True
except Exception:
    OPENAI_SDK_AVAILABLE = False
    logging.warning("OpenAI SDK not available for embedding fallback")

logger = logging.getLogger(__name__)

class VectorDatabase(ABC):
    """Abstract base class for vector database operations"""
    
    @abstractmethod
    async def store_embeddings(self, documents: List[str], metadata: List[Dict], collection_name: str) -> bool:
        """Generates and stores embeddings for a list of document chunks."""
        pass

    @abstractmethod
    async def add_documents(self, documents: List[Dict[str, Any]], collection_name: str = "default") -> bool:
        """Add documents to the vector database"""
        pass
    
    @abstractmethod
    async def similarity_search(self, query: str, collection_name: str = "default", top_k: int = 5) -> List[Dict[str, Any]]:
        """Perform similarity search"""
        pass
    
    @abstractmethod
    async def delete_documents(self, document_ids: List[str], collection_name: str = "default") -> bool:
        """Delete documents from the vector database"""
        pass
    
    @abstractmethod
    async def list_collections(self) -> List[str]:
        """List all available collections"""
        pass

class ChromaVectorDB(VectorDatabase):
    """ChromaDB implementation of vector database"""
    
    def __init__(self, persist_directory: str = "./storage/vector_db"):
        if not CHROMADB_AVAILABLE:
            raise ImportError("ChromaDB is not available. Please install chromadb.")
        
        # Embeddings can be provided by sentence-transformers or OpenAI as a fallback
        
        self.persist_directory = persist_directory
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Initialize embedding backends
        self.embedding_model = None
        self.openai_client = None
        self.openai_embedding_model = os.getenv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')

        # Try local sentence-transformers first (preferred for latency/cost)
        if EMBEDDING_AVAILABLE:
            try:
                cache_dir = os.getenv('SENTENCE_TRANSFORMERS_CACHE', './storage/models/sentencetransformers')
                os.makedirs(cache_dir, exist_ok=True)
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu', cache_folder=cache_dir)
                # Pre-warm the model for faster first inference
                logger.info("Pre-warming local embedding model (all-MiniLM-L6-v2)...")
                _ = self.embedding_model.encode(["warmup"], show_progress_bar=False)
                logger.info("Local embedding model ready")
            except Exception as e:
                logger.error(f"Local embedding model load failed: {e}. Will attempt OpenAI embedding fallback.")

        # Fallback to OpenAI embeddings if local is unavailable
        if self.embedding_model is None and OPENAI_SDK_AVAILABLE and os.getenv('OPENAI_API_KEY'):
            try:
                self.openai_client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))
                logger.info(f"Using OpenAI embeddings fallback: {self.openai_embedding_model}")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI embeddings client: {e}")
        
        if self.embedding_model is None and self.openai_client is None:
            # No embedding backend available
            raise ImportError("No embedding backend available (sentence-transformers and OpenAI fallback unavailable)")
        
        logger.info(f"ChromaVectorDB initialized with persist directory: {persist_directory}")
    
    async def _embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of texts using the available backend."""
        if not texts:
            return []
        try:
            if self.embedding_model is not None:
                return self.embedding_model.encode(
                    texts,
                    show_progress_bar=False,
                    batch_size=32,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                ).tolist()
            elif self.openai_client is not None:
                # Batch to stay under rate limits; small batch size to reduce latency spikes
                vectors: List[List[float]] = []
                batch_size = 64
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i+batch_size]
                    resp = await self.openai_client.embeddings.create(
                        model=self.openai_embedding_model,
                        input=batch,
                    )
                    for d in resp.data:
                        vectors.append(list(d.embedding))
                return vectors
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            raise

    async def store_embeddings(self, documents: List[str], metadata: List[Dict], collection_name: str) -> bool:
        """
        Generates embeddings for a list of documents and stores them in the specified ChromaDB collection.
        Optimized for better performance with batch processing.
        """
        try:
            if not documents:
                logger.warning(f"No documents provided to store embeddings in collection '{collection_name}'.")
                return True

            collection = self.client.get_or_create_collection(name=collection_name)
            
            # Generate unique IDs for each chunk
            ids = [f"{collection_name}_{i}_{hash(doc)}" for i, doc in enumerate(documents)]

            # Generate embeddings
            embeddings = await self._embed_texts(documents)

            # Store in ChromaDB with optimized batch
            collection.add(
                embeddings=embeddings,
                documents=documents,
                metadatas=metadata,
                ids=ids
            )
            
            logger.info(f"✓ Stored {len(documents)} embeddings in collection '{collection_name}'")
            return True
            
        except Exception as e:
            logger.exception(f"Failed to store embeddings in ChromaDB collection '{collection_name}': {e}", exc_info=e)
            return False

    async def add_documents(self, documents: List[Dict[str, Any]], collection_name: str = "default") -> bool:
        """Add documents to ChromaDB collection"""
        try:
            # Get or create collection
            collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"description": f"Document collection: {collection_name}"}
            )
            
            # Prepare documents for ChromaDB
            ids = []
            texts = []
            metadatas = []
            
            for doc in documents:
                doc_id = doc.get('id', f"doc_{len(ids)}")
                content = doc.get('content', '')
                metadata = doc.get('metadata', {})
                
                ids.append(str(doc_id))
                texts.append(content)
                metadatas.append(metadata)
            
            # Generate embeddings
            embeddings = await self._embed_texts(texts)
            
            # Add to collection
            collection.add(
                ids=ids,
                documents=texts,
                metadatas=metadatas,
                embeddings=embeddings
            )
            
            logger.info(f"Added {len(documents)} documents to collection '{collection_name}'")
            return True
            
        except Exception as e:
            logger.error(f"Error adding documents to ChromaDB: {str(e)}")
            return False
    
    async def similarity_search(self, query: str, collection_name: str = "default", top_k: int = 5) -> List[Dict[str, Any]]:
        """Perform similarity search in ChromaDB.

        Uses get_or_create_collection to avoid noisy errors when a collection does not yet exist.
        Returns an empty result set gracefully in that case.
        """
        try:
            # Get or create collection to avoid raising when missing
            collection = self.client.get_or_create_collection(name=collection_name)
            
            # Generate query embedding
            query_embedding = (await self._embed_texts([query]))[0]
            
            # Perform search
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                include=['documents', 'metadatas', 'distances']
            )
            
            # Format results
            formatted_results = []
            for i in range(len(results['ids'][0])):
                result = {
                    'id': results['ids'][0][i],
                    'content': results['documents'][0][i],
                    'metadata': results['metadatas'][0][i],
                    'score': 1 - results['distances'][0][i]  # Convert distance to similarity score
                }
                formatted_results.append(result)
            
            logger.info(f"Found {len(formatted_results)} results for query in collection '{collection_name}'")
            return formatted_results
            
        except Exception as e:
            logger.info(f"No results or collection empty for '{collection_name}': {str(e)}")
            return []
    
    async def delete_documents(self, document_ids: List[str], collection_name: str = "default") -> bool:
        """Delete documents from ChromaDB collection"""
        try:
            collection = self.client.get_collection(name=collection_name)
            collection.delete(ids=[str(doc_id) for doc_id in document_ids])
            
            logger.info(f"Deleted {len(document_ids)} documents from collection '{collection_name}'")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting documents: {str(e)}")
            return False
    
    async def list_collections(self) -> List[str]:
        """List all ChromaDB collections"""
        try:
            collections = self.client.list_collections()
            return [col.name for col in collections]
        except Exception as e:
            logger.error(f"Error listing collections: {str(e)}")
            return []

class MockVectorDB(VectorDatabase):
    """Mock implementation for testing when vector DB is not available"""
    
    def __init__(self):
        self.collections = {}
        logger.warning("Using MockVectorDB - no actual vector operations will be performed")
    
    async def store_embeddings(self, documents: List[str], metadata: List[Dict], collection_name: str) -> bool:
        """Mock storing embeddings."""
        logger.info(f"Mock: Stored {len(documents)} embeddings in collection '{collection_name}'")
        return True

    async def add_documents(self, documents: List[Dict[str, Any]], collection_name: str = "default") -> bool:
        if collection_name not in self.collections:
            self.collections[collection_name] = []
        self.collections[collection_name].extend(documents)
        logger.info(f"Mock: Added {len(documents)} documents to collection '{collection_name}'")
        return True
    
    async def similarity_search(self, query: str, collection_name: str = "default", top_k: int = 5) -> List[Dict[str, Any]]:
        if collection_name not in self.collections:
            return []
        
        # Return first top_k documents (no actual similarity search)
        docs = self.collections[collection_name][:top_k]
        results = []
        for i, doc in enumerate(docs):
            results.append({
                'id': doc.get('id', f'mock_{i}'),
                'content': doc.get('content', ''),
                'metadata': doc.get('metadata', {}),
                'score': 0.5  # Mock score
            })
        
        logger.info(f"Mock: Returned {len(results)} results for query in collection '{collection_name}'")
        return results
    
    async def delete_documents(self, document_ids: List[str], collection_name: str = "default") -> bool:
        if collection_name in self.collections:
            self.collections[collection_name] = [
                doc for doc in self.collections[collection_name] 
                if doc.get('id') not in document_ids
            ]
        logger.info(f"Mock: Deleted {len(document_ids)} documents from collection '{collection_name}'")
        return True
    
    async def list_collections(self) -> List[str]:
        return list(self.collections.keys())

# Global vector database instance
_vector_db_instance: Optional[VectorDatabase] = None

async def get_vector_db() -> VectorDatabase:
    """Get vector database instance (singleton pattern)"""
    global _vector_db_instance
    
    if _vector_db_instance is None:
        try:
            # Try to create ChromaDB instance
            if CHROMADB_AVAILABLE and EMBEDDING_AVAILABLE:
                persist_dir = os.getenv('VECTOR_DB_PATH', './storage/vector_db')
                _vector_db_instance = ChromaVectorDB(persist_directory=persist_dir)
                logger.info("Initialized ChromaVectorDB instance")
            else:
                # Fall back to mock implementation
                _vector_db_instance = MockVectorDB()
                logger.warning("Initialized MockVectorDB instance - install chromadb and sentence-transformers for full functionality")
        
        except Exception as e:
            logger.error(f"Error initializing vector database: {str(e)}")
            logger.warning("Falling back to MockVectorDB")
            _vector_db_instance = MockVectorDB()
    
    return _vector_db_instance

# Factory function for different vector DB types
def create_vector_db(db_type: str = "chromadb", **kwargs) -> VectorDatabase:
    """Create vector database instance based on type"""
    if db_type.lower() == "chromadb":
        if CHROMADB_AVAILABLE and EMBEDDING_AVAILABLE:
            return ChromaVectorDB(**kwargs)
        else:
            logger.warning("ChromaDB not available, using MockVectorDB")
            return MockVectorDB()
    elif db_type.lower() == "mock":
        return MockVectorDB()
    else:
        raise ValueError(f"Unsupported vector database type: {db_type}")

# For backwards compatibility
def vector_db():
    """Synchronous wrapper for get_vector_db (deprecated)"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(get_vector_db())
    finally:
        loop.close() 