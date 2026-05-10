import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

print("[serve_search_api] Starting RAG Search API...")

model = None


def get_model():
    global model
    if model is None:
        print("[serve_search_api] Loading BGE-M3 embedding model...")
        from embed_model import model

        print("[serve_search_api] Model loaded successfully")
    return model


from query_pipeline import hybrid_search, rerank

METADATA_FILE = Path(__file__).parent / "book_metadata.json"

app = FastAPI(title="RAG Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_book_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


class SearchRequest(BaseModel):
    query: str
    use_hyde: bool = False
    top_n: int = 10


class SearchResult(BaseModel):
    text: str
    score: float
    source: str
    pages: str
    gcs_url: str | None
    book_title: str | None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    try:
        print(
            f"[serve_search_api] Search request: query='{req.query}', top_n={req.top_n}"
        )

        encoder = get_model()
        print("[serve_search_api] Encoding query...")
        output = encoder.encode(
            [req.query],
            max_length=1024,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )

        print("[serve_search_api] Running hybrid search...")
        candidates = hybrid_search(output, top_k=20)
        print(f"[serve_search_api] Found {len(candidates)} candidates")

        print("[serve_search_api] Reranking results...")
        raw_results = rerank(req.query, candidates, top_n=req.top_n)
        print(f"[serve_search_api] Returning {len(raw_results)} results")

        metadata = load_book_metadata()

        results = []
        for r in raw_results[: req.top_n]:
            src = r.get("metadata", {}).get("source", "")
            book_title = r.get("metadata", {}).get("book_title", "")
            gcs_url = r.get("metadata", {}).get("gcs_url", "")

            if not gcs_url and src:
                filename = Path(src).name
                book_meta = metadata.get(filename, {})
                gcs_url = book_meta.get("gcs_url", "")
                if not book_title:
                    book_title = book_meta.get("book_title", Path(filename).stem)

            results.append(
                SearchResult(
                    text=r.get("text", ""),
                    score=r.get("score", 0),
                    source=src,
                    pages=r.get("metadata", {}).get("pages", ""),
                    gcs_url=gcs_url or None,
                    book_title=book_title or None,
                )
            )

        return SearchResponse(query=req.query, results=results)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/books")
async def list_books():
    metadata = load_book_metadata()
    return {
        "books": [
            {
                "filename": filename,
                "title": meta.get("book_title", Path(filename).stem),
                "gcs_url": meta.get("gcs_url", ""),
            }
            for filename, meta in metadata.items()
        ]
    }


# source venv/bin/activate && source .env && python serve_search_api.py
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
