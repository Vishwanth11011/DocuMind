import asyncio
from fastapi import Request
from app.routers.query import list_documents
def test():
    try:
        docs = list_documents(user_id="Vish123")
        print("Docs:", docs)
    except Exception as e:
        import traceback
        traceback.print_exc()

test()
