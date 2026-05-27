from typing import Literal

from pydantic import BaseModel, Field

ChunkingStrategy = Literal["fixed", "sentence", "semantic"]


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    page_count: int
    chunks_stored: int
    processing_time_ms: int


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    doc_id: str | None = None
    top_k: int = Field(default=4, ge=1, le=20)


class SourceItem(BaseModel):
    filename: str
    chunk_index: int
    text: str
    score: float


class AskStreamToken(BaseModel):
    token: str


class AskStreamSources(BaseModel):
    sources: list[SourceItem]


class DocumentResponse(BaseModel):
    doc_id: str
    filename: str
    page_count: int = 0
    chunk_count: int
    uploaded_at: str


class LLMResponse(BaseModel):
    answer: str
    model: str
    tokens_used: int


class HealthResponse(BaseModel):
    status: str
    service: str
