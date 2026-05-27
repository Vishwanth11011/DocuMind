import asyncio
from app.services.vector_store import get_vector_store
def test():
    get_vector_store().list_documents(user_id="Vish123")
test()
