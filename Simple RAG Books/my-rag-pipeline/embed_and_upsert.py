from qdrant_client.models import PointStruct, SparseVector, Distance, VectorParams, SparseVectorParams
from qdrant_client import QdrantClient
from FlagEmbedding import BGEM3FlagModel

import uuid
import os

qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
qdrant_api_key = os.getenv('QDRANT_API_KEY')

if qdrant_api_key:
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
else:
    client = QdrantClient(url=qdrant_url)

model = BGEM3FlagModel(
    'BAAI/bge-m3',
    use_fp16=True,   # GPU benefits from fp16
    device='cuda',   # Use GPU for embedding
)


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

    if not client.collection_exists(collection_name="sample_rag"):
        client.create_collection(
            collection_name="sample_rag",
            vectors_config={
                "dense": VectorParams(size=1024, distance=Distance.COSINE)
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams()
            }
        )

    client.upsert(collection_name="sample_rag", points=points)
    print(f"Upserted {len(points)} points to Qdrant")