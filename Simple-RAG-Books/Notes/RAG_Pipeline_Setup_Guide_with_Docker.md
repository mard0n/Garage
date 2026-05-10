# 🔍 LOCAL RAG PIPELINE
### Complete Setup & Implementation Guide

```
Docling  →  Chonkie  →  BGE-M3  →  Qdrant
```

> **Architecture:** Everything runs in Docker. Your code and documents live on your Mac. Two containers run side by side — one for the RAG pipeline (Python, Docling, BGE-M3, etc.), one for Qdrant. No Python version conflicts, no PyTorch compatibility issues.

---

## Pipeline Overview

| Stage | Tool | Purpose |
|---|---|---|
| Extract | Docling | PDF/DOCX parsing, header/footer removal, hyphenation fix |
| Transform | Chonkie | Document-structure chunking + recursive fallback + metadata |
| Embed | BGE-M3 | Multilingual dense + sparse embeddings |
| Store | Qdrant | Local vector database with hybrid search support |
| Query | HyDE / Multi-query | Query expansion before retrieval |
| Retrieve | Dense + Sparse + RRF | Hybrid retrieval with reciprocal rank fusion |
| Expand | Parent-doc retrieval | Context window expansion after retrieval |
| Rerank | BGE-Reranker-v2-m3 | Cross-encoder reranking of candidates |

---

## ⚙️ 0. Prerequisites

**All you need on your Mac:**
- Docker Desktop — [download here](https://www.docker.com/products/docker-desktop/)
- That's it. Python, and all ML packages run inside Docker.

**Verify Docker is running:**
```bash
docker --version
docker ps
```

---

## 📁 1. Project Structure

Set up your project folder on your Mac:

```bash
mkdir my-rag-pipeline
cd my-rag-pipeline

mkdir documents        # put your PDFs here
mkdir qdrant_storage   # Qdrant data persists here

touch Dockerfile
touch docker-compose.yml
touch requirements.txt
touch extract.py
touch chunk.py
touch embed_and_upsert.py
touch hybrid_search.py
touch context_expansion.py
touch rerank.py
touch index_pipeline.py
touch query_pipeline.py
```

Your folder should look like this:

```
my-rag-pipeline/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── documents/          ← put your PDFs here
├── qdrant_storage/     ← Qdrant data (auto-created)
├── extract.py
├── chunk.py
├── embed_and_upsert.py
├── hybrid_search.py
├── context_expansion.py
├── rerank.py
├── index_pipeline.py
└── query_pipeline.py
```

---

## 🐳 2. Docker Setup

### 2.1 — requirements.txt

```text
docling
chonkie
FlagEmbedding
qdrant-client
numpy
tqdm
requests
```

### 2.2 — Dockerfile

```dockerfile
FROM python:3.11-slim

# System dependencies required by Docling
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all pipeline code
COPY *.py .

CMD ["bash"]
```

### 2.3 — docker-compose.yml

This runs both containers together — the RAG pipeline and Qdrant:

```yaml
services:

  qdrant:
    image: qdrant/qdrant
    container_name: qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    restart: unless-stopped

  rag:
    build: .
    container_name: rag-pipeline
    volumes:
      - ./documents:/app/documents      # your PDFs on Mac → container
      - ./:/app                         # live code sync — edit on Mac, runs in container
    depends_on:
      - qdrant
    environment:
      - QDRANT_URL=http://qdrant:6333   # container-to-container networking
    stdin_open: true
    tty: true
```

> **Key point:** The `rag` container talks to `qdrant` via `http://qdrant:6333` (Docker internal network), not `localhost`. This is already handled in the code below.

### 2.4 — Build and Start Everything

```bash
# Build the RAG container (first time takes 5-10 min — downloading docling etc.)
docker compose build

# Start both containers
docker compose up -d

# Verify both are running
docker ps
```

You should see two containers: `qdrant` and `rag-pipeline`.

> **Tip:** Qdrant Dashboard is available at `http://localhost:6333/dashboard` from your Mac browser.

---

## 📄 3. Extract Stage — Docling

### extract.py

```python
from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions
import re

def clean_text(text: str) -> str:
    # Fix soft hyphenation (word-\nbreak -> wordbreak)
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    # Fix broken line breaks inside sentences
    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)
    # Collapse multiple spaces
    text = re.sub(r' +', ' ', text)
    return text.strip()

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = False           # set True for scanned PDFs
pipeline_options.do_table_structure = True

converter = DocumentConverter()

def extract_document(file_path: str) -> list[dict]:
    result = converter.convert(file_path)
    doc = result.document

    pages = []
    for page_no, page in enumerate(doc.pages, start=1):
        page_text = page.export_to_markdown()
        page_text = clean_text(page_text)
        if page_text.strip():
            pages.append({
                'text': page_text,
                'source': file_path,
                'page': page_no,
            })
    return pages
```

> **Note:** Docling downloads layout models (~1-2 GB) on first run inside the container. Subsequent runs use the Docker layer cache.

---

## ✂️ 4. Transform Stage — Chonkie

### chunk.py

```python
from chonkie import RecursiveChunker

# Primary: structure-aware separators (headings, paragraphs, sentences)
primary_chunker = RecursiveChunker(
    chunk_size=512,
    chunk_overlap=64,
    separators=['\n\n', '\n', '. ', ' '],
)

# Fallback: smaller chunks, character-level splitting
fallback_chunker = RecursiveChunker(
    chunk_size=256,
    chunk_overlap=32,
    separators=['. ', ' ', ''],
)

def chunk_with_parents(pages: list[dict]) -> list[dict]:
    """
    Index child chunks (small) but store parent (full page) text in payload.
    Small chunks = precise retrieval. Parent text = full context for LLM.
    """
    results = []

    for page in pages:
        parent_text = page['text']
        try:
            child_chunks = primary_chunker.chunk(parent_text)
            strategy = 'primary'
        except Exception:
            child_chunks = fallback_chunker.chunk(parent_text)
            strategy = 'fallback'

        for i, child in enumerate(child_chunks):
            results.append({
                'text': child.text,
                'metadata': {
                    'source': page['source'],
                    'page': page['page'],
                    'chunk_index': i,
                    'strategy': strategy,
                    'parent_text': parent_text,
                }
            })
    return results
```

---

## 🧠 5. Embed Stage — BGE-M3

### embed_and_upsert.py

```python
import os
import uuid
from FlagEmbedding import BGEM3FlagModel
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, SparseVectorParams,
    SparseIndexParams, PointStruct, SparseVector
)

# Reads QDRANT_URL from environment (set in docker-compose.yml)
QDRANT_URL = os.environ.get('QDRANT_URL', 'http://localhost:6333')
client = QdrantClient(url=QDRANT_URL)

# CPU only — fp16 is GPU-only
model = BGEM3FlagModel(
    'BAAI/bge-m3',
    use_fp16=False,
    device='cpu',
)

COLLECTION_NAME = 'my_rag'
BATCH_SIZE = 16   # keep low for CPU

def create_collection():
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME in existing:
        print(f'Collection "{COLLECTION_NAME}" already exists, skipping.')
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config={
            'dense': VectorParams(size=1024, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            'sparse': SparseVectorParams(
                index=SparseIndexParams(on_disk=False)
            )
        }
    )
    print(f'Collection "{COLLECTION_NAME}" created.')

def embed_and_upsert(chunks: list[dict]):
    create_collection()
    points = []

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [c['text'] for c in batch]

        output = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )

        for j, chunk in enumerate(batch):
            dense_vec = output['dense_vecs'][j].tolist()
            sparse_weights = output['lexical_weights'][j]

            point = PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    'dense': dense_vec,
                    'sparse': SparseVector(
                        indices=list(sparse_weights.keys()),
                        values=list(sparse_weights.values()),
                    )
                },
                payload={
                    'text': chunk['text'],
                    **chunk['metadata'],
                }
            )
            points.append(point)

        print(f'Embedded batch {i // BATCH_SIZE + 1} / {-(-len(chunks) // BATCH_SIZE)}')

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    print(f'Upserted {len(points)} points to Qdrant.')
```

---

## 🔍 6. Query Stage — Expansion Strategies

### 6.1 — HyDE: Hypothetical Document Embeddings

```python
# hyde.py
import requests

def generate_hypothetical_answer(query: str, llm_url: str = 'http://host.docker.internal:11434') -> str:
    """
    Calls Ollama running on your Mac from inside Docker.
    host.docker.internal resolves to your Mac's IP from within a container.
    """
    response = requests.post(f'{llm_url}/api/generate', json={
        'model': 'llama3',
        'prompt': (
            f'Write a short factual passage that would answer this question:\n'
            f'Question: {query}\n'
            f'Passage:'
        ),
        'stream': False,
        'options': {'num_predict': 200},
    })
    return response.json()['response'].strip()

def hyde_query_vector(query: str, model):
    hypothetical = generate_hypothetical_answer(query)
    return model.encode(
        [hypothetical],
        return_dense=True, return_sparse=True, return_colbert_vecs=False
    )
```

> **Note:** If you run Ollama on your Mac, use `http://host.docker.internal:11434` from inside the Docker container. `host.docker.internal` is the Docker-specific hostname that routes back to your Mac.

### 6.2 — Multi-query Retrieval

```python
def generate_query_variants(query: str, n: int = 3) -> list[str]:
    response = requests.post('http://host.docker.internal:11434/api/generate', json={
        'model': 'llama3',
        'prompt': (
            f'Generate {n} different phrasings of this search query, one per line.\n'
            f'Query: {query}\n'
            f'Phrasings:'
        ),
        'stream': False,
    })
    lines = response.json()['response'].strip().split('\n')
    return [query] + [l.strip('0123456789. ') for l in lines if l.strip()][:n]
```

### HyDE vs. Multi-query Comparison

| | HyDE | Multi-query |
|---|---|---|
| **Approach** | Generates a passage, then embeds it | Generates N query rephrases |
| **Best for** | Factual / closed-domain | Broad / open-domain |
| **Retrieval calls** | Single | N calls, then merge + deduplicate |
| **Model requirement** | Requires a capable generative model | Works with any model or even rules |
| **Latency** | Higher per query | Lower per call |

---

## ⚡ 7. Hybrid Retrieval — Dense + Sparse + RRF

### hybrid_search.py

```python
import os
from qdrant_client import QdrantClient
from qdrant_client.models import (
    NamedVector, NamedSparseVector, SparseVector,
    Prefetch, FusionQuery, Fusion
)
from FlagEmbedding import BGEM3FlagModel

QDRANT_URL = os.environ.get('QDRANT_URL', 'http://localhost:6333')
client = QdrantClient(url=QDRANT_URL)

model = BGEM3FlagModel('BAAI/bge-m3', use_fp16=False, device='cpu')

def hybrid_search(query: str, top_k: int = 20) -> list[dict]:
    output = model.encode(
        [query],
        return_dense=True, return_sparse=True, return_colbert_vecs=False
    )

    dense_vec = output['dense_vecs'][0].tolist()
    sparse_weights = output['lexical_weights'][0]
    sparse_vec = SparseVector(
        indices=list(sparse_weights.keys()),
        values=list(sparse_weights.values()),
    )

    results = client.query_points(
        collection_name='my_rag',
        prefetch=[
            Prefetch(
                query=NamedVector(name='dense', vector=dense_vec),
                limit=top_k * 2,
            ),
            Prefetch(
                query=NamedSparseVector(name='sparse', vector=sparse_vec),
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
```

> **How RRF works:** Reciprocal Rank Fusion combines rankings rather than raw scores. `Score = Σ 1 / (k + rank_i)` where `k=60` by default. Robust to score-scale differences between dense and sparse results.

---

## 📖 8. Context Expansion — Parent-Document Retrieval

### context_expansion.py

```python
from hybrid_search import hybrid_search

def retrieve_with_context_expansion(query: str, top_k: int = 5) -> list[dict]:
    raw_results = hybrid_search(query, top_k=top_k * 3)

    # Deduplicate by parent page — same page may match multiple child chunks
    seen_parents = set()
    expanded = []

    for r in raw_results:
        parent_key = f"{r['metadata']['source']}::{r['metadata']['page']}"
        if parent_key not in seen_parents:
            seen_parents.add(parent_key)
            expanded.append({
                'context': r['metadata'].get('parent_text', r['text']),
                'child_match': r['text'],
                'score': r['score'],
                'source': r['metadata']['source'],
                'page': r['metadata']['page'],
            })

        if len(expanded) >= top_k:
            break

    return expanded
```

---

## 🏆 9. Reranker — BGE-Reranker-v2-m3

### rerank.py

```python
from FlagEmbedding import FlagReranker

reranker = FlagReranker(
    'BAAI/bge-reranker-v2-m3',
    use_fp16=False,   # CPU — set True only if GPU is available
)

def rerank(query: str, candidates: list[dict], top_n: int = 5) -> list[dict]:
    pairs = [[query, c['context']] for c in candidates]
    scores = reranker.compute_score(pairs, normalize=True)

    ranked = sorted(
        zip(candidates, scores),
        key=lambda x: x[1],
        reverse=True
    )

    return [
        {**cand, 'rerank_score': score}
        for cand, score in ranked[:top_n]
    ]
```

---

## 🚀 10. Full Pipeline — End-to-End

### 10.1 — index_pipeline.py (run once to index your documents)

```python
import glob
from extract import extract_document
from chunk import chunk_with_parents
from embed_and_upsert import embed_and_upsert

# Finds all PDFs in /app/documents inside the container
# This maps to ./documents/ on your Mac
pdf_files = glob.glob('/app/documents/**/*.pdf', recursive=True)

if not pdf_files:
    print('No PDFs found in /app/documents — add PDFs to your documents/ folder on your Mac.')
    exit(1)

all_chunks = []
for pdf in pdf_files:
    print(f'Processing: {pdf}')
    pages = extract_document(pdf)
    chunks = chunk_with_parents(pages)
    all_chunks.extend(chunks)
    print(f'  → {len(pages)} pages, {len(chunks)} chunks')

print(f'\nTotal chunks to index: {len(all_chunks)}')
embed_and_upsert(all_chunks)
print('Indexing complete!')
```

### 10.2 — query_pipeline.py (run per question)

```python
from context_expansion import retrieve_with_context_expansion
from rerank import rerank

def answer_query(question: str) -> list[dict]:
    candidates = retrieve_with_context_expansion(question, top_k=20)
    final_results = rerank(question, candidates, top_n=5)
    return final_results

if __name__ == '__main__':
    question = input('Enter your question: ')
    results = answer_query(question)
    for i, r in enumerate(results):
        print(f'\n--- Result {i+1} (score: {r["rerank_score"]:.3f}) ---')
        print(f'Source: {r["source"]} | Page: {r["page"]}')
        print(r['context'][:500])
```

---

## ▶️ 11. Running the Pipeline

### Step 1 — Add your PDFs

Copy PDF files into the `documents/` folder on your Mac:

```bash
cp ~/Desktop/mybook.pdf ./documents/
```

### Step 2 — Build and start containers

```bash
# Build the RAG image (once, or after changing Dockerfile/requirements.txt)
docker compose build

# Start both qdrant + rag containers
docker compose up -d

# Confirm both are running
docker ps
```

### Step 3 — Index your documents

```bash
docker compose exec rag python index_pipeline.py
```

First run downloads BGE-M3 (~2.2 GB) — subsequent runs are instant from cache.

### Step 4 — Query

```bash
docker compose exec rag python query_pipeline.py
```

### Useful Docker commands

```bash
# View live logs
docker compose logs -f rag

# Open a shell inside the container (for debugging)
docker compose exec rag bash

# Stop everything
docker compose down

# Stop and wipe all data including Qdrant vectors
docker compose down -v

# Rebuild after changing requirements.txt
docker compose build --no-cache
```

---

## 🔧 12. Troubleshooting & Tips

| Problem | Fix |
|---|---|
| `Cannot connect to Docker daemon` | Open Docker Desktop on your Mac first |
| Qdrant connection refused from rag container | Use `http://qdrant:6333` not `http://localhost:6333` inside Docker |
| Ollama not reachable from container | Use `http://host.docker.internal:11434` instead of `localhost` |
| BGE-M3 download fails inside container | Run `docker compose exec rag bash` then `huggingface-cli download BAAI/bge-m3` |
| No PDFs found | Check files are in `./documents/` on your Mac |
| OOM / container crash | Reduce `BATCH_SIZE` in `embed_and_upsert.py`. In Docker Desktop → Settings → Resources, increase RAM to 8 GB+ |
| Slow embedding | Expected on CPU — i9 takes ~2-5 sec per batch of 16. 100 pages ≈ 10-20 min |
| Code changes not reflected | Files are live-mounted — edits on your Mac apply instantly, no rebuild needed |
| Sparse vectors empty | Ensure `return_sparse=True` in `model.encode()` call |
| Reranker scores all similar | Try `normalize=False` and use raw logit scores instead |

---

> **Pipeline Complete ✓**
>
> `Docling → Chonkie → BGE-M3 → Qdrant → HyDE/Multi-query → Hybrid RRF → Parent-doc → BGE-Reranker`
>
> Everything runs in Docker. Your Mac only needs Docker Desktop installed.
