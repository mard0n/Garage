#!/bin/bash
cd /workspace/Garage/Simple-RAG-Books/my-rag-pipeline
source .env
exec /workspace/Garage/Simple-RAG-Books/my-rag-pipeline/venv/bin/python serve_search_api.py
