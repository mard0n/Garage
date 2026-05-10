#!/bin/bash
cd "/workspace/Garage/Simple RAG Books/my-rag-pipeline"
source venv/bin/activate
source .env
exec python serve_search_api.py
