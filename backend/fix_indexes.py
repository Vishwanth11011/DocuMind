import asyncio
from app.services.vector_store import get_vector_store
from app.config import STRATEGY_COLLECTION_MAP
from qdrant_client.models import PayloadSchemaType
from qdrant_client.http.exceptions import UnexpectedResponse

def fix():
    client = get_vector_store()._get_client()
    for col_name in STRATEGY_COLLECTION_MAP.values():
        try:
            client.create_payload_index(
                collection_name=col_name,
                field_name="user_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            print(f"Created user_id index for {col_name}")
        except UnexpectedResponse as e:
            print(f"Error or already exists for {col_name}: {e}")
            
    # Also for default collection just in case
    col = get_vector_store().collection_name
    try:
        client.create_payload_index(
            collection_name=col,
            field_name="user_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        print(f"Created user_id index for {col}")
    except UnexpectedResponse as e:
        print(f"Error or already exists for {col}: {e}")

fix()
