import os
import uuid

from embed_model import model
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
qdrant_api_key = os.getenv("QDRANT_API_KEY")

if qdrant_api_key:
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
else:
    client = QdrantClient(url=qdrant_url)


BATCH_SIZE = 32


def embed_and_upsert(chunks: list[dict]):
    points = []

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [c["text"] for c in batch]

        output = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )

        for j, chunk in enumerate(batch):
            dense_vec = output["dense_vecs"][j].tolist()
            sparse_weights = output["lexical_weights"][j]

            point = PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "dense": dense_vec,
                    "sparse": SparseVector(
                        indices=list(sparse_weights.keys()),
                        values=list(sparse_weights.values()),
                    ),
                },
                payload={
                    "text": chunk["text"],
                    **chunk["metadata"],
                },
            )
            points.append(point)

        print(f"Embedded batch {i // BATCH_SIZE + 1}")

    if not client.collection_exists(collection_name="rag_books_rus"):
        client.create_collection(
            collection_name="rag_books_rus",
            vectors_config={"dense": VectorParams(size=1024, distance=Distance.COSINE)},
            sparse_vectors_config={"sparse": SparseVectorParams()},
        )

    client.upsert(collection_name="rag_books_rus", points=points)
    print(f"Upserted {len(points)} points to Qdrant")
