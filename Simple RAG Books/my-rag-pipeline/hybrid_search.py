import os
from qdrant_client import QdrantClient
from qdrant_client.models import (
    SparseVector,
    Prefetch,
    FusionQuery,
    Fusion,
)
qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
qdrant_api_key = os.getenv('QDRANT_API_KEY')

if qdrant_api_key:
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
else:
    client = QdrantClient(url=qdrant_url)


def hybrid_search(embedding_output: dict, top_k: int = 20) -> list[dict]:
    """Perform hybrid search using dense + sparse vectors with RRF fusion."""
    dense_vec = embedding_output['dense_vecs'][0].tolist()
    sparse_weights = embedding_output['lexical_weights'][0]
    sparse_vec = SparseVector(
        indices=list(sparse_weights.keys()),
        values=list(sparse_weights.values()),
    )
    results = client.query_points(
        collection_name='sample_rag',
        prefetch=[
            Prefetch(
                query=dense_vec,
                using='dense',
                limit=top_k * 2,
            ),
            Prefetch(
                query=sparse_vec,
                using='sparse',
                limit=top_k * 2,
            ),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        limit=top_k,
        with_payload=True,
    )
    return [
        {'text': r.payload['text'], 'score': r.score, 'metadata': r.payload}
        for r in results.points
    ]