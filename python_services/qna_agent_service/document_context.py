"""
Document context retrieval helpers for the Q&A agent.

Per-user retrieval over the shared vector database. If a specific document
is in focus, we still perform semantic search; if metadata in the store
includes a source identifier, callers may optionally filter on it.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional

from shared.vector_db import get_vector_db
from shared.langchain_config import get_document_content
import httpx
from io import BytesIO

try:
    import PyPDF2  # type: ignore
    _PDF_AVAILABLE = True
except Exception:
    _PDF_AVAILABLE = False

try:
    import fitz  # PyMuPDF
    from PIL import Image  # Pillow is used elsewhere in project
    import pytesseract
    _VISION_OCR_AVAILABLE = True
except Exception:
    _VISION_OCR_AVAILABLE = False
import re


def _chunk_text_by_sentences(text: str, max_chars: int = 800, min_chunk_chars: int = 300) -> List[str]:
    """Greedy sentence-based chunking for better retrieval.

    - Splits on sentence boundaries
    - Packs sentences into chunks of ~max_chars while keeping each chunk >= min_chunk_chars where possible
    """
    if not text:
        return []

    # Normalize whitespace
    normalized = re.sub(r"\s+", " ", text).strip()
    # Rough sentence split (handles ., !, ? followed by space and uppercase or digit)
    sentences = re.split(r"(?<=[\.!?])\s+(?=[A-Z0-9\(\[\"'])", normalized)
    if len(sentences) <= 1:
        # Fallback split if sentence heuristic fails
        return [normalized[i:i+max_chars] for i in range(0, len(normalized), max_chars)]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0
    for sent in sentences:
        s = sent.strip()
        if not s:
            continue
        if current_len + len(s) + 1 <= max_chars:
            current.append(s)
            current_len += len(s) + 1
        else:
            if current:
                chunk = " ".join(current).strip()
                if chunk:
                    chunks.append(chunk)
            current = [s]
            current_len = len(s)

    if current:
        chunk = " ".join(current).strip()
        if chunk:
            chunks.append(chunk)

    # Merge very small trailing chunks
    if len(chunks) >= 2 and len(chunks[-1]) < min_chunk_chars:
        chunks[-2] = (chunks[-2] + " " + chunks[-1]).strip()
        chunks.pop()

    return chunks


async def retrieve_document_context(
    *,
    user_id: Optional[str],
    question: str,
    context: Dict[str, Any],
    top_k: int = 5,
) -> List[str]:
    """Return textual excerpts for grounding.

    Falls back silently to an empty list when no vector DB is available.
    """
    if not user_id:
        return []

    doc_id = context.get("docId")
    doc_title = context.get("documentTitle")

    # Prefer a document-scoped collection when a focused document exists
    collection_name = (
        context.get("collection")
        or (f"{user_id}_doc_{doc_id}" if doc_id else f"{user_id}_default")
    )

    # Lightly enrich the query with document title if present
    query = question
    if doc_title:
        query = f"{question}\nTitle: {doc_title}"

    try:
        vdb = await get_vector_db()

        # If we have a focused document, attempt on-demand ingestion into the collection
        if doc_id:
            try:
                doc = await get_document_content(doc_id=doc_id, user_id=user_id)
                full_text: str = (doc or {}).get("content") or ""
                if full_text:
                    chunks = _chunk_text_by_sentences(full_text)
                    # Prepare chunk documents with metadata for traceability
                    documents_payload = [
                        {
                            "id": f"{doc_id}_{i}",
                            "content": chunk,
                            "metadata": {
                                "docId": doc_id,
                                "documentTitle": doc_title or "",
                                "source": "read_document",
                            },
                        }
                        for i, chunk in enumerate(chunks)
                    ]
                    if documents_payload:
                        # Best-effort; ignore failures
                        await vdb.add_documents(documents=documents_payload, collection_name=collection_name)
            except Exception:
                # If processor route failed and we have a signed URL, try fetching and extracting directly
                document_url = context.get("documentUrl")
                if document_url:
                    try:
                        async with httpx.AsyncClient(timeout=20.0) as client:
                            resp = await client.get(document_url)
                            resp.raise_for_status()
                            data = resp.content or b""

                        extracted_text = ""
                        page_texts: List[str] = []
                        if _PDF_AVAILABLE:
                            try:
                                pdf_reader = PyPDF2.PdfReader(BytesIO(data))
                                for idx, page in enumerate(pdf_reader.pages):
                                    try:
                                        txt = page.extract_text() or ""
                                    except Exception:
                                        txt = ""
                                    page_texts.append(txt)
                                extracted_text = "\n\n".join([t for t in page_texts if t])
                            except Exception:
                                extracted_text = ""

                        # If PDF extraction failed or not a PDF, attempt naive decode
                        if not extracted_text:
                            try:
                                extracted_text = data.decode("utf-8", errors="ignore")
                            except Exception:
                                extracted_text = ""

                        # Optional OCR for diagrams/no text layer
                        if not extracted_text and _VISION_OCR_AVAILABLE:
                            try:
                                doc_pdf = fitz.open(stream=data, filetype="pdf")
                                ocr_pages_text: List[str] = []
                                max_pages = min(5, len(doc_pdf))  # bound runtime
                                for page_index in range(max_pages):
                                    try:
                                        page = doc_pdf.load_page(page_index)
                                        # Scale for better OCR accuracy
                                        zoom = 2.0
                                        mat = fitz.Matrix(zoom, zoom)
                                        pix = page.get_pixmap(matrix=mat, alpha=False)
                                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                                        ocr_text = pytesseract.image_to_string(img)
                                        if ocr_text and ocr_text.strip():
                                            ocr_pages_text.append(ocr_text.strip())
                                    except Exception:
                                        continue
                                extracted_text = "\n\n".join(ocr_pages_text)
                            except Exception:
                                extracted_text = extracted_text  # keep whatever we had

                        if extracted_text:
                            documents_payload: List[dict] = []
                            if page_texts:
                                # Add per-page chunks with page metadata
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
                                                "documentTitle": doc_title or "",
                                                "source": "read_document",
                                                "ingest": "direct_url",
                                                "page": page_index,
                                            },
                                        })
                            else:
                                # Fallback: no page segmentation available
                                chunks = _chunk_text_by_sentences(extracted_text)
                                documents_payload = [
                                    {
                                        "id": f"{doc_id}_{i}",
                                        "content": chunk,
                                        "metadata": {
                                            "docId": doc_id,
                                            "documentTitle": doc_title or "",
                                            "source": "read_document",
                                            "ingest": "direct_url",
                                        },
                                    }
                                    for i, chunk in enumerate(chunks)
                                ]
                            if documents_payload:
                                await vdb.add_documents(documents=documents_payload, collection_name=collection_name)
                    except Exception:
                        # Ignore and allow fallback
                        pass

        # Perform similarity search in the chosen collection with a small time budget
        try:
            import asyncio
            results = await asyncio.wait_for(
                vdb.similarity_search(query=query, collection_name=collection_name, top_k=top_k),
                timeout=2.5,
            )
        except Exception:
            results = []

        # Prefer chunks from the currently visible page if provided
        preferred_pages = []
        if isinstance(context.get("visiblePages"), list):
            preferred_pages = [int(p) for p in context.get("visiblePages") if isinstance(p, (int, str))]
        elif context.get("currentPage"):
            try:
                preferred_pages = [int(context.get("currentPage"))]
            except Exception:
                preferred_pages = []

        scored: List[tuple] = []
        for item in results or []:
            meta = (item or {}).get("metadata") or {}
            page_meta = meta.get("page")
            score = 1
            if preferred_pages and page_meta in preferred_pages:
                score = 0  # higher priority
            content = (item or {}).get("content") or ""
            if content:
                scored.append((score, content))

        scored.sort(key=lambda x: x[0])
        excerpts: List[str] = [c for _, c in scored]

        # If no results from doc-scoped collection, fallback to user default
        if not excerpts and doc_id and collection_name != f"{user_id}_default":
            try:
                alt_results = await asyncio.wait_for(
                    vdb.similarity_search(query=query, collection_name=f"{user_id}_default", top_k=top_k),
                    timeout=1.5,
                )
            except Exception:
                alt_results = []
            for item in alt_results or []:
                content = (item or {}).get("content") or ""
                if content:
                    excerpts.append(content)

        return excerpts
    except Exception:
        return []




