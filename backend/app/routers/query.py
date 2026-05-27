import asyncio
import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse

from app.services.auth import get_current_user

from app.models.schemas import (
    AskRequest,
    AskStreamSources,
    AskStreamToken,
    DocumentResponse,
    SourceItem,
)
from app.services.embedder import embed
from app.services.errors import ServiceError
from app.services.llm import generate_answer, hits_to_sources, stream_answer
from app.services.vector_store import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter()


def _ndjson_line(payload: dict[str, object]) -> str:
    return json.dumps(payload) + "\n"


@router.post("/ask")
def ask_question(body: AskRequest, user_id: str = Depends(get_current_user)) -> StreamingResponse:
    """
    Embed the question, retrieve context, and stream the LLM answer as NDJSON.

    Each line is either {"token": "..."} or a final {"sources": [...]}.
    """
    try:
        question = body.question.strip()
        if not question:
            raise ServiceError("Question must not be empty.", 400)

        query_vectors = embed([question])
        hits = get_vector_store().search(
            query_vector=query_vectors[0],
            user_id=user_id,
            top_k=body.top_k,
            doc_id=body.doc_id,
        )
        sources: list[SourceItem] = hits_to_sources(hits)

        def event_stream() -> Iterator[str]:
            try:
                for token in stream_answer(question, hits):
                    line = AskStreamToken(token=token).model_dump()
                    yield _ndjson_line(line)
                sources_line = AskStreamSources(sources=sources).model_dump()
                yield _ndjson_line(sources_line)
            except ServiceError as exc:
                error_payload = {"error": exc.message}
                yield _ndjson_line(error_payload)
            except Exception as exc:
                logger.error("Unexpected streaming error: %s", exc)
                yield _ndjson_line({"error": "Internal server error"})

        return StreamingResponse(
            event_stream(),
            media_type="application/x-ndjson",
        )
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Unexpected ask error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.post("/compare")
async def compare(body: AskRequest, user_id: str = Depends(get_current_user)):
    """
    Runs the question against all 3 strategy collections in parallel.
    Returns a map of strategy → {answer, sources, tokens_used}.
    """
    try:
        question = body.question.strip()
        if not question:
            raise ServiceError("Question must not be empty.", 400)

        query_vectors = embed([question])

        def query_strategy(strategy: str):
            from app.config import STRATEGY_COLLECTION_MAP
            col = STRATEGY_COLLECTION_MAP.get(strategy, "documind")
            docs = get_vector_store().search(
                query_vector=query_vectors[0],
                user_id=user_id,
                top_k=body.top_k,
                doc_id=body.doc_id,
                collection=col,
            )
            result = generate_answer(question, docs)
            return strategy, {
                "answer": result.answer,
                "sources": [
                    {
                        "filename": d["filename"],
                        "chunk_index": d["chunk_index"],
                        "score": round(d["score"], 3),
                        "preview": d["text"][:150]
                    }
                    for d in docs
                ],
                "tokens_used": result.tokens_used
            }

        tasks = [asyncio.to_thread(query_strategy, s) for s in ["fixed", "sentence", "semantic"]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output = {}
        for item in results:
            if isinstance(item, Exception):
                strategy = item.args[0] if item.args else "unknown"
                output[strategy] = {"error": str(item)}
            else:
                strategy, data = item
                output[strategy] = data

        return output
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Unexpected compare error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(user_id: str = Depends(get_current_user)) -> list[DocumentResponse]:
    """List all uploaded documents aggregated from Qdrant."""
    try:
        from app.config import COLLECTION_FIXED
        docs_normal = get_vector_store().list_documents(user_id=user_id)
        docs_compare = get_vector_store().list_documents(user_id=user_id, collection=COLLECTION_FIXED)
        
        merged = {}
        for doc in docs_normal:
            merged[doc["doc_id"]] = doc
        for doc in docs_compare:
            if doc["doc_id"] not in merged:
                merged[doc["doc_id"]] = doc
                
        return [
            DocumentResponse(
                doc_id=doc["doc_id"],
                filename=doc["filename"],
                page_count=doc["page_count"],
                chunk_count=doc["chunk_count"],
                uploaded_at=doc["uploaded_at"],
            )
            for doc in merged.values()
        ]
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Unexpected list documents error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, user_id: str = Depends(get_current_user)) -> Response:
    """Delete a document and all of its chunks from Qdrant."""
    try:
        if not doc_id.strip():
            raise ServiceError("doc_id must not be empty.", 400)

        from app.config import COLLECTION_FIXED, STRATEGY_COLLECTION_MAP
        docs_normal = get_vector_store().list_documents(user_id=user_id)
        docs_compare = get_vector_store().list_documents(user_id=user_id, collection=COLLECTION_FIXED)
        known_ids = {doc["doc_id"] for doc in docs_normal + docs_compare}

        if doc_id not in known_ids:
            raise ServiceError(f"Document '{doc_id}' not found.", 404)

        get_vector_store().delete_document(doc_id, user_id=user_id)
        for col_name in STRATEGY_COLLECTION_MAP.values():
            get_vector_store().delete_document(doc_id, user_id=user_id, collection=col_name)
        return Response(status_code=204)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Unexpected delete document error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
