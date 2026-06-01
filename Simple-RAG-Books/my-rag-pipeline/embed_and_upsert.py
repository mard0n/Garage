import json
import os
import uuid
from pathlib import Path

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
CHECKPOINT_FILE = Path(__file__).parent / ".embed_checkpoint.json"


def load_checkpoint() -> set[int]:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return set(json.load(f).get("processed", []))
    return set()


def save_checkpoint(processed: set[int]):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({"processed": sorted(processed)}, f)


def clear_checkpoint():
    CHECKPOINT_FILE.unlink(missing_ok=True)


def embed_and_upsert(chunks: list[dict]):
    processed_indices = load_checkpoint()
    if processed_indices:
        print(f"Resuming from checkpoint: {len(processed_indices)}/{len(chunks)} chunks already embedded")

    ensure_collection()

    all_points = []
    for i in range(0, len(chunks), BATCH_SIZE):
        batch_indices = set(range(i, min(i + BATCH_SIZE, len(chunks))))
        if batch_indices.issubset(processed_indices):
            print(f"Batch {i // BATCH_SIZE + 1} already processed, skipping")
            continue

        batch = chunks[i : i + BATCH_SIZE]
        texts = [c["text"] for c in batch]

        output = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=True,
        )

        batch_points = []
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
            batch_points.append(point)

        all_points.extend(batch_points)
        processed_indices.update(batch_indices)
        save_checkpoint(processed_indices)

        print(f"Embedded batch {i // BATCH_SIZE + 1}/{(len(chunks) - 1) // BATCH_SIZE + 1} ({len(processed_indices)}/{len(chunks)} chunks)")

        client.upsert(collection_name="sample_rag", points=batch_points)
        print(f"  Upserted {len(batch_points)} points to Qdrant")

    clear_checkpoint()
    print(f"Done: {len(all_points)} total points upserted to Qdrant")


def ensure_collection():
    if not client.collection_exists(collection_name="sample_rag"):
        client.create_collection(
            collection_name="sample_rag",
            vectors_config={"dense": VectorParams(size=1024, distance=Distance.COSINE)},
            sparse_vectors_config={"sparse": SparseVectorParams()},
        )
        print("Created collection 'sample_rag'")
