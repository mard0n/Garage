# Local RAG Pipeline — Native Python Setup

## Overview

```
Docling  →  HybridChunker  →  BGE-M3  →  Qdrant Cloud
```

Everything runs natively on your Mac or RunPod. No Docker required.

---

## Pipeline

| Stage | Tool | Purpose |
|-------|------|---------|
| Extract + OCR | Docling | PDF parsing, OCR for scanned docs (Russian + English) |
| Chunk | HybridChunker | Document-structure-aware chunking at 512 tokens |
| Embed | BGE-M3 | Multilingual dense + sparse embeddings (RunPod GPU) |
| Store | Qdrant Cloud | Vector database with hybrid search |
| Retrieve | Dense + Sparse + RRF | Hybrid retrieval with reciprocal rank fusion |
| Rerank | BGE-Reranker-v2-m3 | Cross-encoder reranking of candidates |

---

## Setup

```bash
cd my-rag-pipeline

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

## Chunking (Local — no GPU needed)

1. **Put your PDFs** in `my-rag-pipeline/documents/`

2. **Run chunking:**
   ```bash
   cd my-rag-pipeline
   source venv/bin/activate
   python index_all.py
   ```

3. **Output** lands in `my-rag-pipeline/chunks/`:
   - `chunks/chunks.json` — all chunks combined
   - `chunks/<book_name>/chunk_0000.txt` — individual chunk files

The chunker automatically detects scanned PDFs (first 3 pages) and enables OCR with Russian + English language support.

---

## Full Pipeline (Embed + Upsert to Qdrant)

Run on a GPU machine (RunPod). In `index_all.py`, uncomment:
```python
from embed_and_upsert import embed_and_upsert
```
and:
```python
embed_and_upsert(all_chunks)
```

See [`RUNPOD.md`](../my-rag-pipeline/RUNPOD.md) for deployment instructions.

---

## Search API

```bash
cd my-rag-pipeline
source venv/bin/activate
source .env
python serve_search_api.py
```

The API serves on `http://localhost:8080`.

---

## Environment Variables

Create `.env` in `my-rag-pipeline/`:

| Variable | Required For |
|----------|-------------|
| `QDRANT_URL` | Embed + upsert, search API |
| `QDRANT_API_KEY` | Embed + upsert, search API |
| `OPENROUTER_API_KEY` | HyDE query expansion |
| `GCS_PROJECT_ID` | PDF upload to GCS |
| `GCS_BUCKET_NAME` | PDF upload to GCS |
| `GCS_SERVICE_ACCOUNT_JSON` | PDF upload to GCS |

---

## Scripts Overview

| Script | Purpose | GPU Needed |
|--------|---------|------------|
| `chunk.py` | Docling OCR + HybridChunker | No |
| `index_all.py` | Chunk all PDFs (embed commented out by default) | No (chunk only) |
| `embed_and_upsert.py` | BGE-M3 embed + Qdrant upsert | Yes |
| `embed_model.py` | BGE-M3 + reranker init | Yes |
| `hybrid_search.py` | Dense + sparse hybrid search | No |
| `rerank.py` | BGE-Reranker-v2-m3 cross-encoder | No |
| `query_pipeline.py` | Query orchestration | No |
| `serve_search_api.py` | FastAPI search server | No |
| `upload_pdfs.py` | Upload PDFs + thumbnails to GCS | No |
| `parse_books.py` | Parse RAG Data/ directory to GCS | No |
