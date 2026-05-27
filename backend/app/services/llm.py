import logging
from collections.abc import Iterator
from typing import TYPE_CHECKING

import google.generativeai as genai

from app.config import get_settings
from app.models.schemas import LLMResponse, SourceItem
from app.services.errors import ServiceError

if TYPE_CHECKING:
    from app.services.vector_store import SearchHit

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"

GROUNDING_INSTRUCTION = """You are a document assistant. Answer ONLY using the provided context.
If the answer is not in the context, say "I couldn't find that in the uploaded documents."
Always cite which source snippet your answer comes from."""


def _configure_client() -> None:
    settings = get_settings()
    genai.configure(api_key=settings.gemini_api_key)


def format_context(hits: list["SearchHit"]) -> str:
    """Format retrieved chunks for the LLM prompt."""
    if not hits:
        return "(No context retrieved.)"

    lines: list[str] = []
    for index, hit in enumerate(hits, start=1):
        lines.append(
            f"[CHUNK {index} - {hit['filename']}, chunk {hit['chunk_index']}]: "
            f"{hit['text']}"
        )
    return "\n".join(lines)


def build_prompt(question: str, hits: list["SearchHit"]) -> str:
    """Build the grounded prompt sent to Gemini."""
    context = format_context(hits)
    return (
        f"System: {GROUNDING_INSTRUCTION}\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question.strip()}"
    )


def hits_to_sources(hits: list["SearchHit"]) -> list[SourceItem]:
    """Map vector search hits to API source citations."""
    return [
        SourceItem(
            filename=hit["filename"],
            chunk_index=hit["chunk_index"],
            text=hit["text"],
            score=hit["score"],
        )
        for hit in hits
    ]


def _extract_token_count(response: object) -> int:
    usage = getattr(response, "usage_metadata", None)
    if usage is not None:
        total = getattr(usage, "total_token_count", None)
        if isinstance(total, int) and total > 0:
            return total
    return 0


def generate_answer(question: str, hits: list["SearchHit"]) -> LLMResponse:
    """Non-streaming Gemini call (for tests or batch use)."""
    _configure_client()
    prompt = build_prompt(question, hits)

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
    except Exception as exc:
        logger.error("Gemini generate_content failed: %s", exc)
        raise ServiceError("Failed to generate answer from language model.", 502) from exc

    answer = (response.text or "").strip()
    tokens_used = _extract_token_count(response)
    if tokens_used == 0:
        tokens_used = max(1, len(prompt) // 4 + len(answer) // 4)

    return LLMResponse(
        answer=answer,
        model=GEMINI_MODEL,
        tokens_used=tokens_used,
    )


def stream_answer(question: str, hits: list["SearchHit"]) -> Iterator[str]:
    """Stream Gemini response tokens."""
    _configure_client()
    prompt = build_prompt(question, hits)

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except ServiceError:
        raise
    except Exception as exc:
        logger.error("Gemini streaming failed: %s", exc)
        raise ServiceError("Failed to stream answer from language model.", 502) from exc
