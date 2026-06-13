#!/bin/bash
set -e

echo "========================================"
echo "   RAG Pipeline - Full Orchestrator"
echo "========================================"
echo ""
echo "This script will:"
echo "  1. Upload PDFs to GCS (from RAG Data folder via parse_books.py)"
echo "  2. Index documents (chunk + embed + upsert to Qdrant)"
echo "  3. Start the search API"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "[1/3] Processing books from RAG Data..."
cd "$PIPELINE_DIR"
python parse_books.py

echo ""
echo "[2/3] Running indexing pipeline (chunk + embed + upsert)..."
cd "$PIPELINE_DIR"
python index_all.py --embed

echo ""
echo "[3/3] Starting search API..."
cd "$PIPELINE_DIR"
nohup python serve_search_api.py > server.log 2>&1 &
API_PID=$!

echo ""
echo "========================================"
echo "   All Done!"
echo "========================================"
echo ""
echo "API running at: http://0.0.0.0:8080"
echo "  - POST /search   - Search the RAG"
echo "  - GET  /books    - List uploaded books"
echo "  - GET  /health   - Health check"
echo ""
echo "API PID: $API_PID"
echo "Logs: tail -f server.log"
echo ""
