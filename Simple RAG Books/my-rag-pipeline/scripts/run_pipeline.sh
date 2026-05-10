#!/bin/bash
set -e

echo "========================================"
echo "   RAG Pipeline - Full Orchestrator"
echo "========================================"
echo ""
echo "This script will:"
echo "  1. Upload PDFs to GCS"
echo "  2. Index documents to Qdrant"
echo "  3. Start the search API"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "[1/3] Uploading PDFs to GCS..."
cd "$SCRIPT_DIR"
python upload_pdfs.py

echo ""
echo "[2/3] Running indexing pipeline..."
cd "$SCRIPT_DIR/.."
python scripts/index_all.py

echo ""
echo "[3/3] Starting search API..."
cd "$SCRIPT_DIR/.."
uvicorn scripts.serve_search_api:app --host 0.0.0.0 --port 8080 &
API_PID=$!

echo ""
echo "========================================"
echo "   All Done!"
echo "========================================"
echo ""
echo "API running at: http://0.0.0.0:8000"
echo "  - POST /search   - Search the RAG"
echo "  - GET  /books    - List uploaded books"
echo "  - GET  /health   - Health check"
echo ""
echo "Docs: http://0.0.0.0:8000/docs"
echo ""
echo "To stop: kill $API_PID"