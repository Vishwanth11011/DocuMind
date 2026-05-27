import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Literal, TypedDict

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

import nltk
from nltk.tokenize import sent_tokenize

logger = logging.getLogger(__name__)

ChunkStrategy = Literal["fixed", "sentence", "semantic"]
VALID_STRATEGIES: frozenset[str] = frozenset({"fixed", "sentence", "semantic"})

DEFAULT_CHUNK_SIZE = 500
DEFAULT_OVERLAP_PERCENT = 10.0
DEFAULT_SIMILARITY_THRESHOLD = 0.75
DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"
SEMANTIC_EMBED_BATCH_SIZE = 32


class ChunkRecord(TypedDict):
    text: str
    chunk_index: int
    strategy: str


_nltk_ready = False
_NLTK_DATA_DIR = Path(__file__).resolve().parents[2] / "nltk_data"


def _ensure_nltk_data() -> None:
    """Download NLTK tokenizer data once if not present."""
    global _nltk_ready
    if _nltk_ready:
        return

    _NLTK_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if str(_NLTK_DATA_DIR) not in nltk.data.path:
        nltk.data.path.insert(0, str(_NLTK_DATA_DIR))

    download_dir = str(_NLTK_DATA_DIR)
    for package in ("punkt", "punkt_tab"):
        try:
            nltk.data.find(f"tokenizers/{package}")
        except (LookupError, OSError):
            nltk.download(package, download_dir=download_dir, quiet=True)

    _nltk_ready = True


@lru_cache(maxsize=1)
def _get_embedding_model(model_name: str) -> "SentenceTransformer":
    """Lazy-load the sentence-transformer model for semantic chunking."""
    from sentence_transformers import SentenceTransformer

    logger.info("Loading embedding model for semantic chunking: %s", model_name)
    return SentenceTransformer(model_name)


def _tokenize_words(text: str) -> list[str]:
    """Split text into word-like tokens for fixed-size windows."""
    return re.findall(r"\S+", text)


def _build_chunk_records(chunks: list[str], strategy: str) -> list[ChunkRecord]:
    records: list[ChunkRecord] = []
    for index, chunk_text in enumerate(chunks):
        stripped = chunk_text.strip()
        if stripped:
            records.append(
                ChunkRecord(
                    text=stripped,
                    chunk_index=index,
                    strategy=strategy,
                )
            )
    return records


def _chunk_fixed(
    text: str,
    chunk_size: int,
    overlap_percent: float,
) -> list[str]:
    tokens = _tokenize_words(text)
    if not tokens:
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    if not 0 <= overlap_percent < 100:
        raise ValueError("overlap_percent must be between 0 and 100 (exclusive of 100)")

    overlap_tokens = max(0, int(chunk_size * (overlap_percent / 100.0)))
    step = max(1, chunk_size - overlap_tokens)

    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunks.append(" ".join(tokens[start:end]))
        if end >= len(tokens):
            break
        start += step

    return chunks


def _chunk_sentence(text: str) -> list[str]:
    _ensure_nltk_data()
    sentences = sent_tokenize(text)
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b, strict=True))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def _embed_sentences(sentences: list[str], model_name: str) -> list[list[float]]:
    import numpy as np

    model = _get_embedding_model(model_name)
    embedding_rows: list[list[float]] = []
    for start in range(0, len(sentences), SEMANTIC_EMBED_BATCH_SIZE):
        batch = sentences[start : start + SEMANTIC_EMBED_BATCH_SIZE]
        batch_embeddings = model.encode(
            batch,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        for row in np.asarray(batch_embeddings):
            embedding_rows.append(row.astype(float).tolist())
    return embedding_rows


def _chunk_semantic(
    text: str,
    similarity_threshold: float,
    embedding_model: str,
) -> list[str]:
    sentences = _chunk_sentence(text)
    if not sentences:
        return []
    if len(sentences) == 1:
        return sentences

    if not 0.0 <= similarity_threshold <= 1.0:
        raise ValueError("similarity_threshold must be between 0.0 and 1.0")

    vectors = _embed_sentences(sentences, embedding_model)
    chunks: list[str] = []
    current_sentences: list[str] = [sentences[0]]

    for index in range(1, len(sentences)):
        similarity = _cosine_similarity(vectors[index - 1], vectors[index])
        if similarity >= similarity_threshold:
            current_sentences.append(sentences[index])
        else:
            chunks.append(" ".join(current_sentences))
            current_sentences = [sentences[index]]

    chunks.append(" ".join(current_sentences))
    return chunks


def chunk(
    text: str,
    strategy: str = "fixed",
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap_percent: float = DEFAULT_OVERLAP_PERCENT,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
) -> list[ChunkRecord]:
    """
    Split document text into chunks using the selected strategy.

    Strategies:
        fixed: Token windows of `chunk_size` with `overlap_percent` overlap.
        sentence: One chunk per sentence (NLTK sentence tokenizer).
        semantic: Merge consecutive sentences while embedding similarity
                  stays at or above `similarity_threshold`.

    Returns:
        List of dicts: {"text", "chunk_index", "strategy"}.
    """
    normalized = text.strip()
    if not normalized:
        return []

    if strategy not in VALID_STRATEGIES:
        raise ValueError(
            f"Invalid chunking strategy '{strategy}'. "
            f"Choose one of: {', '.join(sorted(VALID_STRATEGIES))}."
        )

    if strategy == "fixed":
        raw_chunks = _chunk_fixed(normalized, chunk_size, overlap_percent)
    elif strategy == "sentence":
        raw_chunks = _chunk_sentence(normalized)
    else:
        raw_chunks = _chunk_semantic(
            normalized,
            similarity_threshold,
            embedding_model,
        )

    return _build_chunk_records(raw_chunks, strategy)
