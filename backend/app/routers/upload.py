import logging
import time
from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.models.schemas import ChunkingStrategy, UploadResponse
from app.services.auth import get_current_user
from app.services.chunker import VALID_STRATEGIES, chunk
from app.services.embedder import embed
from app.services.errors import ServiceError
from app.services.parser import parse_pdf
from app.services.vector_store import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    chunking_strategy: ChunkingStrategy = Form("fixed"),
    compare_mode: bool = Form(False),
    user_id: str = Depends(get_current_user),
):
    """
    Upload a PDF, chunk it, embed chunks, and store vectors in Qdrant.
    """
    try:
        settings = get_settings()
        max_bytes = settings.max_file_size_mb * 1024 * 1024

        if not file.filename:
            raise ServiceError("Uploaded file must have a filename.", 400)

        if not file.filename.lower().endswith(".pdf"):
            raise ServiceError("Only PDF files are supported.", 400)

        if chunking_strategy not in VALID_STRATEGIES:
            raise ServiceError(
                f"Invalid chunking strategy '{chunking_strategy}'. "
                f"Choose one of: {', '.join(sorted(VALID_STRATEGIES))}.",
                400,
            )

        file_bytes = await file.read()
        if not file_bytes:
            raise ServiceError("Uploaded file is empty.", 400)
        if len(file_bytes) > max_bytes:
            raise ServiceError(
                f"File exceeds the {settings.max_file_size_mb}MB size limit.",
                400,
            )

        start = time.perf_counter()
        doc_id = str(uuid4())

        buffer = BytesIO(file_bytes)
        parsed = parse_pdf(buffer, file.filename)

        from app.config import STRATEGY_COLLECTION_MAP
        results = {}
        for strategy in ["fixed", "sentence", "semantic"]:
            chunks_res = chunk(parsed["text"], strategy)
            if not chunks_res:
                results[strategy] = 0
                continue
            vectors = embed([item["text"] for item in chunks_res])
            col = STRATEGY_COLLECTION_MAP[strategy]
            
            # Ingest into the strategy-specific collection for Compare Mode
            get_vector_store().upsert_chunks(
                doc_id=doc_id,
                filename=parsed["filename"],
                user_id=user_id,
                chunks=chunks_res,
                vectors=vectors,
                page_count=parsed["page_count"],
                collection=col,
            )
            
            # Also ingest the user's selected primary strategy into the default collection for Normal Mode
            if strategy == chunking_strategy:
                get_vector_store().upsert_chunks(
                    doc_id=doc_id,
                    filename=parsed["filename"],
                    user_id=user_id,
                    chunks=chunks_res,
                    vectors=vectors,
                    page_count=parsed["page_count"],
                )
            results[strategy] = len(chunks_res)

        processing_time_ms = int((time.perf_counter() - start) * 1000)

        return {
            "doc_id": doc_id,
            "filename": parsed["filename"],
            "page_count": parsed["page_count"],
            "compare_mode": True,
            "chunks_per_strategy": results,
            "chunks_stored": sum(results.values()),
            "processing_time_ms": processing_time_ms,
        }
    except HTTPException:
        raise
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Unexpected upload error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
