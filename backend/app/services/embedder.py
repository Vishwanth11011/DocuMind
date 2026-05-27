import logging
from typing import TYPE_CHECKING

import numpy as np

from app.config import get_settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

BATCH_SIZE = 32
VECTOR_SIZE_MINI_LM = 384


class EmbedderService:
    """Singleton wrapper around SentenceTransformer for document embeddings."""

    _instance: "EmbedderService | None" = None

    def __init__(self) -> None:
        settings = get_settings()
        self._model_name = settings.embedding_model
        self._model: SentenceTransformer | None = None
        self._vector_size: int | None = None

    @classmethod
    def get_instance(cls) -> "EmbedderService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def vector_size(self) -> int:
        if self._vector_size is None:
            self.load()
        assert self._vector_size is not None
        return self._vector_size

    def load(self) -> None:
        """Load the embedding model once (idempotent)."""
        if self._model is not None:
            return

        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model: %s", self._model_name)
        self._model = SentenceTransformer(self._model_name)
        self._vector_size = int(self._model.get_sentence_embedding_dimension())
        logger.info("Embedding model ready (dim=%s)", self._vector_size)

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a list of texts into dense vectors.

        Processes inputs in batches of 32 to limit memory use on small hosts.
        """
        if not texts:
            return []

        self.load()
        assert self._model is not None

        all_vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            embeddings = self._model.encode(
                batch,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
            matrix = np.asarray(embeddings, dtype=np.float32)
            for row in matrix:
                all_vectors.append(row.tolist())

        return all_vectors


def load_embedder() -> None:
    """Preload the embedding model at application startup."""
    EmbedderService.get_instance().load()


def get_vector_size() -> int:
    """Return the embedding dimension for the configured model."""
    return EmbedderService.get_instance().vector_size


def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts using the shared singleton model."""
    return EmbedderService.get_instance().embed(texts)
