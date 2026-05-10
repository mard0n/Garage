import glob
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from chunk import chunk_document

from embed_and_upsert import embed_and_upsert

METADATA_FILE = Path(__file__).parent / "book_metadata.json"
OUTPUT_DIR = Path(__file__).parent / "chunks"
DOCUMENTS_DIR = Path(__file__).parent / "documents"


def load_book_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def index_all():
    print("=== RAG Indexing Pipeline ===")
    print(f"Documents dir: {DOCUMENTS_DIR}")
    print(f"Output dir: {OUTPUT_DIR}")
    print(f"Metadata file: {METADATA_FILE}\n")

    metadata = load_book_metadata()
    if not metadata:
        print(
            "WARNING: book_metadata.json not found. GCS URLs won't be added to chunks."
        )
        print("Run upload_pdfs.py first to create it.\n")

    pdf_files = glob.glob(str(DOCUMENTS_DIR / "*.pdf"))
    if not pdf_files:
        print(f"ERROR: No PDF files found in {DOCUMENTS_DIR}")
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDF files to process.\n")

    OUTPUT_DIR.mkdir(exist_ok=True)
    all_chunks = []

    for pdf_path in pdf_files:
        filename = Path(pdf_path).name
        title = filename.replace(".pdf", "").replace("needsocr", "").strip()

        print(f"[1/3] Chunking: {filename}")
        chunks = chunk_document(pdf_path, title)
        print(f"  -> {len(chunks)} chunks created")

        book_metadata = metadata.get(filename, {})
        gcs_url = book_metadata.get("gcs_url", "")

        for chunk in chunks:
            if gcs_url:
                chunk["metadata"]["gcs_url"] = gcs_url
                chunk["metadata"]["book_title"] = title

        all_chunks.extend(chunks)

    print(f"\n[2/3] Total chunks: {len(all_chunks)}")

    json_path = OUTPUT_DIR / "chunks.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
    print(f"Saved chunks to {json_path}")

    print(f"\n[3/3] Embedding and upserting to Qdrant...")
    embed_and_upsert(all_chunks)

    print("\n=== Indexing Complete ===")
    print(f"Collection: rag_books_rus")
    print(f"Total points: {len(all_chunks)}")


if __name__ == "__main__":
    index_all()
