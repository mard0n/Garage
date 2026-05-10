# RunPod Deployment Scripts

Scripts to deploy, index, and serve your RAG pipeline on RunPod.

## Prerequisites

1. **RunPod GPU pod** deployed with PyTorch/CUDA image
2. **GitHub repo** with branch `simple-rag-books` (or modify `deploy.sh` for your repo)
3. **GCP project** and GCS bucket (created via `setup_gcp.sh`)
4. **Qdrant Cloud** cluster
5. **SSH access** to RunPod instance

## Quick Start

### 1. Setup GCS (run locally, not on RunPod)

```bash
./setup_gcp.sh
```

Follow the prompts to authenticate with gcloud, create bucket, and generate service account key.

Add the outputs to your `.env` file:
```
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'
```

### 2. Deploy to RunPod

```bash
./deploy.sh <runpod_ip> <ssh_user> [path_to_ssh_key]
```

Example:
```bash
./deploy.sh 123.45.67.89 root ~/.ssh/runpod
```

The deploy script will:
- Clone your repo onto RunPod
- Install system dependencies
- Install Python packages
- Prompt you to create the `.env` file on RunPod

### 3. Upload PDFs to RunPod

```bash
scp -i ~/.ssh/runpod ./documents/*.pdf root@123.45.67.89:/app/rag-pipeline/documents/
```

### 4. Run the pipeline

SSH into RunPod and run:

```bash
cd /app/rag-pipeline

# Set environment variables
export QDRANT_URL=https://your-cluster.qdrant.io
export QDRANT_API_KEY=your-key
export OPENROUTER_API_KEY=your-key
export GCS_PROJECT_ID=your-project-id
export GCS_BUCKET_NAME=your-bucket-name
export GCS_SERVICE_ACCOUNT_JSON='{...}'

# Or source your .env file
source .env

# Run everything
./scripts/run_pipeline.sh
```

Or run steps individually:

```bash
# Upload PDFs to GCS
python scripts/upload_pdfs.py

# Index to Qdrant
python scripts/index_all.py

# Start API (in background)
uvicorn scripts.serve_search_api:app --host 0.0.0.0 --port 8000 &
```

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `setup_gcp.sh` | Create GCS bucket and service account (run locally) |
| `deploy.sh` | Deploy codebase to RunPod via SSH |
| `upload_pdfs.py` | Upload PDFs from `documents/` to GCS |
| `index_all.py` | Chunk, embed, and upsert documents to Qdrant |
| `serve_search_api.py` | FastAPI server for search endpoint |
| `run_pipeline.sh` | Orchestrator - runs all steps in sequence |

## API Endpoints

Once `serve_search_api.py` is running on port 8000:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/search` | POST | Search RAG. Body: `{"query": "..."}` |
| `/books` | GET | List all uploaded books |

## Environment Variables

On RunPod, set these before running scripts:

```bash
# Qdrant
QDRANT_URL=https://xxx.qdrant.io
QDRANT_API_KEY=your-key

# OpenRouter (for HyDE)
OPENROUTER_API_KEY=your-key

# GCS
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'
```

## Flow

```
Local                  RunPod                    GCS                 Qdrant
  │                        │                       │                    │
  │  deploy.sh ──────────► │                       │                    │
  │                        │                       │                    │
  │  scp documents/* ─────► │                       │                    │
  │                        │                       │                    │
  │                        │ upload_pdfs.py ──────► │                    │
  │                        │                       │                    │
  │                        │ index_all.py ──────────────────────────────► │
  │                        │                       │                    │
  │                        │ serve_search_api.py ◄─┼─────────────────────┤
  │                        │                       │                    │
  │                        │ (API on :8000)        │                    │
  └────────────────────────┴───────────────────────┴────────────────────┘
                              ▲
                              │
                         Your Hono UI
                         (from Vercel)
```