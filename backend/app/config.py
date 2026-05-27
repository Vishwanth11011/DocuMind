from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_qdrant_url(url: str) -> str:
    """
    Normalize Qdrant URL for the REST client.

    Qdrant Cloud uses HTTPS on port 443. Do not append :6333 (that breaks cloud).
    """
    cleaned = url.strip().rstrip("/")
    if "cloud.qdrant.io" in cleaned and ":6333" in cleaned:
        cleaned = cleaned.replace(":6333", "")
    return cleaned


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str
    qdrant_url: str
    qdrant_api_key: str

    @field_validator("qdrant_url")
    @classmethod
    def validate_qdrant_url(cls, value: str) -> str:
        normalized = normalize_qdrant_url(value)
        if not normalized.startswith(("http://", "https://")):
            raise ValueError(
                "QDRANT_URL must start with https:// (e.g. your Qdrant Cloud cluster URL)."
            )
        if "xxx" in normalized or "your_" in normalized.lower():
            raise ValueError("QDRANT_URL still contains placeholder text.")
        return normalized
    qdrant_collection: str = "documind"
    embedding_model: str = "all-MiniLM-L6-v2"
    max_file_size_mb: int = 50


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()

COLLECTION_FIXED    = "documind_fixed"
COLLECTION_SENTENCE = "documind_sentence"
COLLECTION_SEMANTIC = "documind_semantic"

STRATEGY_COLLECTION_MAP = {
    "fixed":    COLLECTION_FIXED,
    "sentence": COLLECTION_SENTENCE,
    "semantic": COLLECTION_SEMANTIC,
}
