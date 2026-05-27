import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import query, upload, auth
from app.services.embedder import get_vector_size, load_embedder
from app.services.vector_store import initialize_vector_store

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load embedding model and ensure Qdrant collection on startup."""
    from app.config import get_settings

    settings = get_settings()
    logger.info("Connecting to Qdrant at %s", settings.qdrant_url)
    try:
        from app.services.embedder import get_vector_size
        import asyncio
        
        # Initialize vector store quickly (get_vector_size now hardcodes the default size)
        initialize_vector_store(get_vector_size())
        
        from app.config import STRATEGY_COLLECTION_MAP
        from app.services.vector_store import get_vector_store
        store = get_vector_store()
        vec_size = get_vector_size()
        for strategy, col_name in STRATEGY_COLLECTION_MAP.items():
            if not store.collection_exists(col_name):
                store.create_collection(col_name, vector_size=vec_size)
                
        # Start loading embedder in background so it's ready for first request
        asyncio.create_task(asyncio.to_thread(load_embedder))
    except Exception as exc:
        logger.error(
            "Startup failed while loading models or Qdrant. "
            "Check QDRANT_URL in backend/.env (Qdrant Cloud: https://....cloud.qdrant.io, no :6333). "
            "Error: %s",
            exc,
        )
        raise
    yield


app = FastAPI(
    title="DocuMind",
    description="RAG document Q&A API",
    version="1.0.0",
    lifespan=lifespan,
)

# Include 127.0.0.1 — Vite may open as localhost or 127.0.0.1; CORS origins must match exactly.
CORS_ORIGINS = [
    "https://your-app.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["auth"])
app.include_router(upload.router, tags=["upload"])
app.include_router(query.router, tags=["query"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Liveness probe for deployment and local verification."""
    return {"status": "ok", "service": "documind-api"}

