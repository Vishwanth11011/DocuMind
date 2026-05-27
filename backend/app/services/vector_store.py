import logging
from datetime import datetime, timezone
from typing import TypedDict
from uuid import NAMESPACE_DNS, uuid5

from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

# Fields used in Filter / delete selectors — require payload indexes on Qdrant Cloud.
PAYLOAD_INDEX_FIELDS: tuple[str, ...] = ("doc_id", "user_id")

from app.config import get_settings
from app.services.chunker import ChunkRecord

logger = logging.getLogger(__name__)


class DocumentInfo(TypedDict):
    doc_id: str
    filename: str
    page_count: int
    chunk_count: int
    uploaded_at: str


class SearchHit(TypedDict):
    point_id: str
    text: str
    chunk_index: int
    doc_id: str
    filename: str
    score: float


class VectorStoreService:
    """Qdrant Cloud client for chunk storage and similarity search."""

    _instance: "VectorStoreService | None" = None

    def __init__(self) -> None:
        settings = get_settings()
        self._collection = settings.qdrant_collection
        self._client: QdrantClient | None = None

    @classmethod
    def get_instance(cls) -> "VectorStoreService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def collection_name(self) -> str:
        return self._collection

    def _get_client(self) -> QdrantClient:
        if self._client is None:
            settings = get_settings()
            self._client = QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key,
            )
            logger.info("Connected to Qdrant at %s", settings.qdrant_url)
        return self._client

    def ensure_collection(self, vector_size: int) -> None:
        """Create the collection if it does not already exist."""
        client = self._get_client()
        exists = False

        try:
            client.get_collection(collection_name=self._collection)
            exists = True
            logger.info("Qdrant collection '%s' already exists", self._collection)
        except UnexpectedResponse as exc:
            if exc.status_code != 404:
                raise
            logger.info(
                "Qdrant collection '%s' not found; creating (size=%s)",
                self._collection,
                vector_size,
            )

        if not exists:
            client.create_collection(
                collection_name=self._collection,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Created Qdrant collection '%s'", self._collection)

        self._ensure_payload_indexes()

    def _ensure_payload_indexes(self) -> None:
        """Create payload indexes required for filtered search and deletes."""
        client = self._get_client()
        for field_name in PAYLOAD_INDEX_FIELDS:
            try:
                client.create_payload_index(
                    collection_name=self._collection,
                    field_name=field_name,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                logger.info(
                    "Created payload index on '%s' in '%s'",
                    field_name,
                    self._collection,
                )
            except UnexpectedResponse as exc:
                message = str(exc).lower()
                if exc.status_code in (400, 409) and (
                    "already exists" in message or "already indexed" in message
                ):
                    logger.debug(
                        "Payload index on '%s' already exists", field_name
                    )
                    continue
                raise

    @staticmethod
    def _point_id(doc_id: str, chunk_index: int) -> str:
        return str(uuid5(NAMESPACE_DNS, f"{doc_id}:{chunk_index}"))

    def upsert_chunks(
        self,
        doc_id: str,
        filename: str,
        user_id: str,
        chunks: list[ChunkRecord],
        vectors: list[list[float]],
        page_count: int = 0,
        collection: str | None = None,
    ) -> int:
        """
        Store chunk vectors and metadata in Qdrant.

        Payload per point: text, chunk_index, doc_id, user_id, filename, uploaded_at.
        """
        if len(chunks) != len(vectors):
            raise ValueError(
                f"chunks length ({len(chunks)}) must match vectors length ({len(vectors)})"
            )
        if not chunks:
            return 0

        uploaded_at = datetime.now(timezone.utc).isoformat()
        points: list[PointStruct] = []

        for chunk, vector in zip(chunks, vectors, strict=True):
            chunk_index = chunk["chunk_index"]
            points.append(
                PointStruct(
                    id=self._point_id(doc_id, chunk_index),
                    vector=vector,
                    payload={
                        "text": chunk["text"],
                        "chunk_index": chunk_index,
                        "doc_id": doc_id,
                        "user_id": user_id,
                        "filename": filename,
                        "page_count": page_count,
                        "uploaded_at": uploaded_at,
                    },
                )
            )

        client = self._get_client()
        col = collection or self._collection
        client.upsert(collection_name=col, points=points)
        logger.info(
            "Upserted %s chunks for doc_id=%s filename=%s",
            len(points),
            doc_id,
            filename,
        )
        return len(points)

    def search(
        self,
        query_vector: list[float],
        user_id: str,
        top_k: int = 4,
        doc_id: str | None = None,
        collection: str | None = None,
    ) -> list[SearchHit]:
        """Similarity search with optional per-document filter."""
        must_conditions = [
            FieldCondition(
                key="user_id",
                match=MatchValue(value=user_id),
            )
        ]
        
        if doc_id is not None:
            must_conditions.append(
                FieldCondition(
                    key="doc_id",
                    match=MatchValue(value=doc_id),
                )
            )
            
        query_filter = Filter(must=must_conditions)

        client = self._get_client()
        col = collection or self._collection
        results = client.search(
            collection_name=col,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter,
            with_payload=True,
        )

        hits: list[SearchHit] = []
        for scored in results:
            payload = scored.payload or {}
            hits.append(
                SearchHit(
                    point_id=str(scored.id),
                    text=str(payload.get("text", "")),
                    chunk_index=int(payload.get("chunk_index", 0)),
                    doc_id=str(payload.get("doc_id", "")),
                    filename=str(payload.get("filename", "")),
                    score=float(scored.score),
                )
            )
        return hits

    def list_documents(self, user_id: str, collection: str | None = None) -> list[DocumentInfo]:
        """Aggregate unique documents stored in the collection."""
        client = self._get_client()
        col = collection or self._collection
        aggregated: dict[str, DocumentInfo] = {}
        offset: str | int | None = None
        
        scroll_filter = Filter(
            must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
        )

        while True:
            records, offset = client.scroll(
                collection_name=col,
                scroll_filter=scroll_filter,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )

            for point in records:
                payload = point.payload or {}
                doc_id = str(payload.get("doc_id", ""))
                if not doc_id:
                    continue

                filename = str(payload.get("filename", "unknown"))
                uploaded_at = str(payload.get("uploaded_at", ""))

                page_count = int(payload.get("page_count", 0) or 0)

                if doc_id not in aggregated:
                    aggregated[doc_id] = DocumentInfo(
                        doc_id=doc_id,
                        filename=filename,
                        page_count=page_count,
                        chunk_count=1,
                        uploaded_at=uploaded_at,
                    )
                else:
                    aggregated[doc_id]["chunk_count"] += 1
                    existing_time = aggregated[doc_id]["uploaded_at"]
                    if uploaded_at and (
                        not existing_time or uploaded_at < existing_time
                    ):
                        aggregated[doc_id]["uploaded_at"] = uploaded_at

            if offset is None:
                break

        documents = list(aggregated.values())
        documents.sort(key=lambda doc: doc["uploaded_at"], reverse=True)
        return documents

    def delete_document(self, doc_id: str, user_id: str, collection: str | None = None) -> None:
        """Delete all points belonging to a document."""
        client = self._get_client()
        col = collection or self._collection
        client.delete(
            collection_name=col,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="doc_id",
                        match=MatchValue(value=doc_id),
                    ),
                    FieldCondition(
                        key="user_id",
                        match=MatchValue(value=user_id),
                    )
                ]
            ),
        )
        logger.info("Deleted document doc_id=%s from Qdrant", doc_id)

    def collection_exists(self, name: str) -> bool:
        client = self._get_client()
        collections = client.get_collections().collections
        return any(c.name == name for c in collections)

    def create_collection(self, name: str, vector_size: int = 384) -> None:
        client = self._get_client()
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
        )
        for field_name in PAYLOAD_INDEX_FIELDS:
            try:
                client.create_payload_index(
                    collection_name=name,
                    field_name=field_name,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
            except UnexpectedResponse:
                pass


def get_vector_store() -> VectorStoreService:
    return VectorStoreService.get_instance()


def initialize_vector_store(vector_size: int) -> None:
    """Ensure Qdrant collection exists (call at app startup)."""
    get_vector_store().ensure_collection(vector_size)
