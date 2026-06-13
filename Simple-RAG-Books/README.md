# Simple RAG Books (E-Kutubxona)

A full-stack **Retrieval-Augmented Generation (RAG)** application for a digital library of Uzbek academic and literary content. Ingest PDF books, index them into a vector database, and search semantically across their contents.

## Architecture

```
User → Next.js Frontend → FastAPI RAG API → Qdrant Vector DB
                                          → GCS (PDFs/thumbnails)
```

Two main components:

### 1. RAG Pipeline (`my-rag-pipeline/`)

Python-based pipeline for PDF ingestion, embedding, and search.

- **PDF parsing** — extracts text via PyMuPDF; detects scanned/image-only PDFs.
- **Chunking** — sentence-aware 512-token chunks.
- **Embedding** — [BGE-M3](https://huggingface.co/BAAI/bge-m3) (dense + sparse vectors).
- **Vector storage** — [Qdrant](https://qdrant.tech) (~1M free tier).
- **Hybrid search** — dense + sparse with Reciprocal Rank Fusion (RRF) and cross-encoder reranking via [BGE-Reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3).
- **HyDE** (optional) — Hypothetical Document Embeddings via OpenRouter for query expansion.
- **API server** — FastAPI on port 8080 (`POST /search`, `GET /books`, `GET /health`).

### 2. Frontend (`frontend/`)

Next.js 16 web app (E-Kutubxona) with:

- Browse books by category
- **Text search** — client-side title/author matching from metadata
- **AI search** — semantic content search proxied to the RAG pipeline
- Book detail pages with PDF viewing
- Per-user saved books (Clerk auth + localStorage)
- Internationalization (Uzbek, English, Russian)

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 20+
- Qdrant Cloud cluster (free tier)
- GCP project with a GCS bucket
- Anki desktop app with AnkiConnect add-on (optional)

### Backend / RAG Pipeline

```bash
cd my-rag-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `my-rag-pipeline/.env`:
```
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-key
OPENROUTER_API_KEY=your-key
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'
```

**Index books (local — chunking only):**
```bash
python index_all.py
```

**Full pipeline (with GPU for embedding + Qdrant upsert):**
```bash
python parse_books.py          # Upload PDFs + thumbnails to GCS
python index_all.py --embed    # Chunk + embed + upsert
# Or:
bash scripts/run_pipeline.sh
```

**Start the search API:**
```bash
python serve_search_api.py
# → http://0.0.0.0:8080
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=https://your-api-url
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-key
CLERK_SECRET_KEY=your-secret
```

```bash
npm run dev      # http://localhost:3000
npm run build    # Production build
```

## Deployment

| Component | Target |
|---|---|
| Embedding / indexing | RunPod (GPU instance) |
| Vector DB | Qdrant Cloud |
| PDFs & thumbnails | Google Cloud Storage |
| Frontend | Vercel (or any Node.js host) |

See `my-rag-pipeline/RUNPOD.md` and `my-rag-pipeline/scripts/` for deployment details.

## Project Structure

```
Simple-RAG-Books/
├── RAG Data/                  # Raw PDF source files (organized by category)
├── frontend/                  # Next.js web application
│   ├── app/                   # App Router pages & API routes
│   ├── components/            # UI components
│   ├── lib/                   # Data access & i18n
│   ├── messages/              # Translation files (uz, ru, en)
│   ├── db/books.json          # Book metadata
│   └── public/                # Static assets
├── my-rag-pipeline/           # Python RAG pipeline
│   ├── chunk.py               # PDF parsing & chunking
│   ├── embed_model.py         # BGE-M3 + reranker init
│   ├── hybrid_search.py       # Qdrant hybrid search
│   ├── query_pipeline.py      # End-to-end query
│   ├── serve_search_api.py    # FastAPI server
│   └── scripts/               # Deployment scripts
└── Notes/                     # Project planning docs
```

## Tech Stack

**Backend:** Python, FastAPI, PyMuPDF, BGE-M3 (FlagEmbedding), BGE-Reranker-v2-m3, Qdrant

**Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Clerk, i18next

**Cloud:** RunPod, Qdrant Cloud, Google Cloud Storage, Vercel
