"""
File Processing Utilities for Document Intelligence
Handles PDF, DOCX, TXT, and other formats with metadata extraction
"""

import os
import hashlib
import mimetypes
from typing import Dict, List, Optional, Tuple, Any
import filetype
import logging
from datetime import datetime
from pathlib import Path
import re

# Document processing imports
import PyPDF2
from docx import Document
from PIL import Image
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class FileProcessor:
    """Comprehensive file processing and content extraction"""
    
    SUPPORTED_EXTENSIONS = {
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'html': 'text/html',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png'
    }
    
    def __init__(self, storage_path: str = "./storage/documents"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (self.storage_path / "user_uploads").mkdir(exist_ok=True)
        (self.storage_path / "processed").mkdir(exist_ok=True)
        (self.storage_path / "thumbnails").mkdir(exist_ok=True)
        
        logger.info(f"FileProcessor initialized with storage at {storage_path}")
    
    async def process_upload(self, file_content: bytes, filename: str, user_id: str) -> Dict[str, Any]:
        """Process uploaded file and extract content and metadata"""
        try:
            # Validate file
            file_info = await self._validate_file(file_content, filename)
            if not file_info['valid']:
                raise ValueError(f"Invalid file: {file_info['error']}")
            
            # Generate unique file ID
            file_id = self._generate_file_id(file_content, filename)
            
            # Save original file
            original_path = await self._save_original_file(file_content, file_id, filename)
            
            # Extract content based on file type
            content_data = await self._extract_content(file_content, file_info['mime_type'])
            
            # Generate metadata
            metadata = await self._generate_metadata(
                file_content, filename, file_info, user_id, file_id
            )
            
            # Save processed content
            processed_path = await self._save_processed_content(content_data, file_id)
            
            # Generate thumbnail if applicable
            thumbnail_path = await self._generate_thumbnail(file_content, file_info, file_id)
            
            result = {
                'file_id': file_id,
                'original_filename': filename,
                'content': content_data,
                'metadata': metadata,
                'paths': {
                    'original': str(original_path),
                    'processed': str(processed_path),
                    'thumbnail': str(thumbnail_path) if thumbnail_path else None
                },
                'status': 'processed',
                'processed_at': datetime.utcnow().isoformat()
            }
            
            logger.info(f"Successfully processed file {filename} with ID {file_id}")
            return result
            
        except Exception as e:
            logger.error(f"Error processing file {filename}: {str(e)}")
            raise
    
    async def _validate_file(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """Validate uploaded file"""
        try:
            # Check file size (100MB limit)
            max_size = 100 * 1024 * 1024  # 100MB
            if len(file_content) > max_size:
                return {'valid': False, 'error': f'File too large: {len(file_content)} bytes'}
            
            # Detect file type
            file_type = filetype.guess(file_content)
            if file_type:
                mime_type = file_type.mime
                extension = file_type.extension
            else:
                # Fallback to filename extension
                extension = Path(filename).suffix.lower().lstrip('.')
                mime_type = self.SUPPORTED_EXTENSIONS.get(extension)
            
            # Check if supported
            if not mime_type or extension not in self.SUPPORTED_EXTENSIONS:
                return {'valid': False, 'error': f'Unsupported file type: {extension}'}
            
            return {
                'valid': True,
                'mime_type': mime_type,
                'extension': extension,
                'size': len(file_content)
            }
            
        except Exception as e:
            return {'valid': False, 'error': f'Validation error: {str(e)}'}
    
    def _generate_file_id(self, file_content: bytes, filename: str) -> str:
        """Generate unique file ID based on content hash"""
        content_hash = hashlib.sha256(file_content).hexdigest()[:16]
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"{timestamp}_{content_hash}"
    
    async def _save_original_file(self, file_content: bytes, file_id: str, filename: str) -> Path:
        """Save original uploaded file"""
        extension = Path(filename).suffix
        file_path = self.storage_path / "user_uploads" / f"{file_id}{extension}"
        
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        return file_path
    
    async def _extract_content(self, file_content: bytes, mime_type: str) -> Dict[str, Any]:
        """Extract text content based on file type"""
        try:
            if mime_type == 'application/pdf':
                return await self._extract_pdf_content(file_content)
            elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                return await self._extract_docx_content(file_content)
            elif mime_type in ['text/plain', 'text/markdown']:
                return await self._extract_text_content(file_content)
            elif mime_type == 'text/html':
                return await self._extract_html_content(file_content)
            elif mime_type.startswith('image/'):
                return await self._extract_image_content(file_content)
            else:
                return {'type': 'unknown', 'content': '', 'pages': 0}
                
        except Exception as e:
            logger.error(f"Content extraction error: {str(e)}")
            return {'type': 'error', 'content': f'Extraction failed: {str(e)}', 'pages': 0}
    
    async def _extract_pdf_content(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from PDF files with optimized performance"""
        try:
            from io import BytesIO
            import concurrent.futures
            
            pdf_file = BytesIO(file_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            num_pages = len(pdf_reader.pages)
            logger.info(f"Processing PDF with {num_pages} pages")
            
            # For large PDFs, process pages concurrently
            if num_pages > 10:
                # Process pages in parallel for faster extraction
                text_content = []
                
                def extract_page_text(page_num):
                    try:
                        page = pdf_reader.pages[page_num]
                        text = page.extract_text().strip()
                        return {
                            'page': page_num + 1,
                            'content': text
                        }
                    except Exception as e:
                        logger.warning(f"Failed to extract page {page_num + 1}: {e}")
                        return {
                            'page': page_num + 1,
                            'content': ''
                        }
                
                # Use thread pool for parallel page extraction
                with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                    futures = [executor.submit(extract_page_text, i) for i in range(num_pages)]
                    
                    for future in concurrent.futures.as_completed(futures):
                        result = future.result()
                        if result:
                            text_content.append(result)
                
                # Sort by page number
                text_content.sort(key=lambda x: x['page'])
                
            else:
                # For small PDFs, process sequentially
                text_content = []
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        text_content.append({
                            'page': page_num + 1,
                            'content': page_text.strip()
                        })
                    except Exception as e:
                        logger.warning(f"Failed to extract page {page_num + 1}: {e}")
                        text_content.append({
                            'page': page_num + 1,
                            'content': ''
                        })
            
            # Combine text efficiently
            full_text = '\n\n'.join([
                f"[Page {page['page']}]\n{page['content']}" 
                for page in text_content 
                if page['content']  # Skip empty pages
            ])
            
            # For very large documents, truncate to reasonable size
            max_chars = 500000  # 500K characters max
            if len(full_text) > max_chars:
                logger.warning(f"PDF content truncated from {len(full_text)} to {max_chars} characters")
                full_text = full_text[:max_chars] + "\n\n[Content truncated for processing...]"
            
            return {
                'type': 'pdf',
                'content': full_text,
                'pages': len(text_content),
                'page_contents': text_content[:100],  # Limit stored page contents
                'word_count': len(full_text.split()),
                'char_count': len(full_text),
                'truncated': len(full_text) > max_chars
            }
            
        except Exception as e:
            logger.error(f"PDF extraction error: {str(e)}")
            return {'type': 'pdf', 'content': f'PDF extraction failed: {str(e)}', 'pages': 0}
    
    async def _extract_docx_content(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from DOCX files"""
        try:
            from io import BytesIO
            docx_file = BytesIO(file_content)
            doc = Document(docx_file)
            
            paragraphs = []
            for para in doc.paragraphs:
                if para.text.strip():
                    paragraphs.append(para.text.strip())
            
            full_text = '\n'.join(paragraphs)
            
            return {
                'type': 'docx',
                'content': full_text,
                'pages': 1,  # DOCX doesn't have clear page breaks
                'paragraphs': len(paragraphs),
                'word_count': len(full_text.split()),
                'char_count': len(full_text)
            }
            
        except Exception as e:
            logger.error(f"DOCX extraction error: {str(e)}")
            return {'type': 'docx', 'content': f'DOCX extraction failed: {str(e)}', 'pages': 0}
    
    async def _extract_text_content(self, file_content: bytes) -> Dict[str, Any]:
        """Extract content from plain text files"""
        try:
            text = file_content.decode('utf-8')
            
            return {
                'type': 'text',
                'content': text,
                'pages': 1,
                'lines': len(text.split('\n')),
                'word_count': len(text.split()),
                'char_count': len(text)
            }
            
        except UnicodeDecodeError:
            try:
                text = file_content.decode('latin-1')
                return {
                    'type': 'text',
                    'content': text,
                    'pages': 1,
                    'encoding': 'latin-1',
                    'word_count': len(text.split()),
                    'char_count': len(text)
                }
            except Exception as e:
                return {'type': 'text', 'content': f'Text decoding failed: {str(e)}', 'pages': 0}
    
    async def _extract_html_content(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from HTML files"""
        try:
            html = file_content.decode('utf-8')
            soup = BeautifulSoup(html, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            return {
                'type': 'html',
                'content': text,
                'pages': 1,
                'title': soup.title.string if soup.title else None,
                'word_count': len(text.split()),
                'char_count': len(text)
            }
            
        except Exception as e:
            logger.error(f"HTML extraction error: {str(e)}")
            return {'type': 'html', 'content': f'HTML extraction failed: {str(e)}', 'pages': 0}
    
    async def _extract_image_content(self, file_content: bytes) -> Dict[str, Any]:
        """Extract metadata from images (OCR to be added later)"""
        try:
            from io import BytesIO
            image = Image.open(BytesIO(file_content))
            
            return {
                'type': 'image',
                'content': '[Image content - OCR not implemented yet]',
                'pages': 1,
                'dimensions': image.size,
                'format': image.format,
                'mode': image.mode
            }
            
        except Exception as e:
            logger.error(f"Image processing error: {str(e)}")
            return {'type': 'image', 'content': f'Image processing failed: {str(e)}', 'pages': 0}
    
    async def _generate_metadata(self, file_content: bytes, filename: str, 
                                file_info: Dict, user_id: str, file_id: str) -> Dict[str, Any]:
        """Generate comprehensive file metadata"""
        return {
            'file_id': file_id,
            'original_filename': filename,
            'user_id': user_id,
            'upload_timestamp': datetime.utcnow().isoformat(),
            'file_size': len(file_content),
            'mime_type': file_info['mime_type'],
            'extension': file_info['extension'],
            'file_hash': hashlib.sha256(file_content).hexdigest(),
            'processing_version': '1.0',
            'source': 'user_upload'
        }
    
    async def _save_processed_content(self, content_data: Dict, file_id: str) -> Path:
        """Save processed content as JSON"""
        import json
        
        processed_path = self.storage_path / "processed" / f"{file_id}.json"
        
        with open(processed_path, 'w', encoding='utf-8') as f:
            json.dump(content_data, f, indent=2, ensure_ascii=False)
        
        return processed_path
    
    async def _generate_thumbnail(self, file_content: bytes, file_info: Dict, file_id: str) -> Optional[Path]:
        """Generate thumbnail for supported file types"""
        try:
            if file_info['mime_type'].startswith('image/'):
                from io import BytesIO
                image = Image.open(BytesIO(file_content))
                image.thumbnail((200, 200), Image.Resampling.LANCZOS)
                
                thumbnail_path = self.storage_path / "thumbnails" / f"{file_id}_thumb.jpg"
                image.save(thumbnail_path, "JPEG", quality=85)
                
                return thumbnail_path
            
            # For PDFs, we could generate thumbnails of first page
            # For now, return None for non-image files
            return None
            
        except Exception as e:
            logger.error(f"Thumbnail generation error: {str(e)}")
            return None

class DocumentChunker:
    """Intelligent document chunking for vector storage - optimized for speed"""
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # Pre-compile regex for better performance
        self.sentence_end_pattern = re.compile(r'[.!?]\s+')
    
    async def chunk_document(self, content: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split document into semantic chunks for vector storage - optimized version"""
        try:
            chunks = []
            text = content.strip()
            
            if not text:
                return []
            
            if len(text) <= self.chunk_size:
                # Document is small enough to be a single chunk
                chunks.append({
                    'content': text,
                    'chunk_id': 0,
                    'metadata': {**metadata, 'chunk_index': 0, 'total_chunks': 1}
                })
            else:
                # Pre-process text to find sentence boundaries for faster chunking
                sentence_boundaries = [0]  # Start of text
                for match in self.sentence_end_pattern.finditer(text):
                    sentence_boundaries.append(match.end())
                sentence_boundaries.append(len(text))  # End of text
                
                # Split into chunks using sentence boundaries
                start = 0
                chunk_id = 0
                
                while start < len(text):
                    # Find the ideal end point
                    ideal_end = start + self.chunk_size
                    
                    if ideal_end >= len(text):
                        # Last chunk
                        chunk_text = text[start:].strip()
                    else:
                        # Find the nearest sentence boundary
                        end = ideal_end
                        
                        # Binary search for the best sentence boundary
                        left = 0
                        right = len(sentence_boundaries) - 1
                        best_boundary = ideal_end
                        
                        while left <= right:
                            mid = (left + right) // 2
                            boundary = sentence_boundaries[mid]
                            
                            if boundary <= start:
                                left = mid + 1
                            elif boundary > ideal_end + 100:  # Too far ahead
                                right = mid - 1
                            else:
                                # Found a boundary in acceptable range
                                if abs(boundary - ideal_end) < abs(best_boundary - ideal_end):
                                    best_boundary = boundary
                                
                                if boundary < ideal_end:
                                    left = mid + 1
                                else:
                                    right = mid - 1
                        
                        end = best_boundary
                        chunk_text = text[start:end].strip()
                    
                    if chunk_text:
                        chunks.append({
                            'content': chunk_text,
                            'chunk_id': chunk_id,
                            'metadata': {
                                **metadata, 
                                'chunk_index': chunk_id,
                                'char_start': start,
                                'char_end': start + len(chunk_text)
                            }
                        })
                        chunk_id += 1
                    
                    # Move to next chunk with overlap
                    if start + len(chunk_text) >= len(text):
                        break
                    
                    # For overlap, try to start at a sentence boundary
                    overlap_start = max(0, start + len(chunk_text) - self.chunk_overlap)
                    
                    # Find the next sentence start after overlap point
                    for boundary in sentence_boundaries:
                        if boundary > overlap_start:
                            start = boundary
                            break
                    else:
                        start = overlap_start
                
                # Update total chunks in all metadata
                for chunk in chunks:
                    chunk['metadata']['total_chunks'] = len(chunks)
            
            logger.info(f"✓ Created {len(chunks)} optimized chunks")
            return chunks
            
        except Exception as e:
            logger.error(f"Document chunking error: {str(e)}")
            return []

# Factory function for easy access
def get_file_processor(storage_path: str = None) -> FileProcessor:
    """Get configured file processor instance"""
    storage_path = storage_path or os.getenv('FILE_STORAGE_PATH', './storage/documents')
    return FileProcessor(storage_path) 