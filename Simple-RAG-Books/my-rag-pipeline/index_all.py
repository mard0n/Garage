import argparse
import glob
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from chunk import chunk_document

METADATA_FILE = Path(__file__).parent / "book_metadata.json"
OUTPUT_DIR = Path(__file__).parent / "chunks"
DEFAULT_DATA_DIR = Path(__file__).parent.parent / "RAG Data"


def load_book_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def index_all(data_dir: Path, embed: bool = False):
    print("=== RAG Indexing Pipeline ===")
    print(f"Data dir: {data_dir}")
    print(f"Output dir: {OUTPUT_DIR}")
    print(f"Metadata file: {METADATA_FILE}\n")

    metadata = load_book_metadata()
    if not metadata:
        print(
            "WARNING: book_metadata.json not found. GCS URLs won't be added to chunks."
        )
        print("Run parse_books.py first to create it.\n")

    pdf_files = glob.glob(str(data_dir / "**" / "*.pdf"), recursive=True)
    if not pdf_files:
        print(f"ERROR: No PDF files found in {data_dir}")
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDF files to process.\n")

    OUTPUT_DIR.mkdir(exist_ok=True)
    all_chunks = []

    for pdf_path in pdf_files:
        filename = Path(pdf_path).name
        title = filename.replace(".pdf", "").strip()

        print(f"[1/2] Chunking: {filename}")
        chunks = chunk_document(pdf_path, title)
        if not chunks:
            print(f"  -> SKIPPED (no chunks produced)")
            continue
        print(f"  -> {len(chunks)} chunks created")

        book_metadata = metadata.get(filename, {})
        gcs_url = book_metadata.get("gcs_url", "")

        for chunk in chunks:
            if gcs_url:
                chunk["metadata"]["gcs_url"] = gcs_url
                chunk["metadata"]["book_title"] = title

        all_chunks.extend(chunks)

        book_dir = OUTPUT_DIR / filename.replace(".pdf", "")
        book_dir.mkdir(exist_ok=True)
        for chunk in chunks:
            idx = chunk["metadata"]["chunk_index"]
            (book_dir / f"chunk_{idx:04d}.txt").write_text(
                chunk["text"], encoding="utf-8"
            )
        print(f"  -> individual chunks saved to {book_dir}/")

    print(f"\n[2/2] Total chunks: {len(all_chunks)}")

    json_path = OUTPUT_DIR / "chunks.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
    print(f"Saved chunks to {json_path}")

    if embed:
        from embed_and_upsert import embed_and_upsert

        print(f"\nEmbedding and upserting {len(all_chunks)} chunks to Qdrant...")
        embed_and_upsert(all_chunks)

    print("\n=== Indexing Complete ===")
    print(f"Total chunks: {len(all_chunks)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--embed", action="store_true", help="Embed and upsert chunks to Qdrant")
    parser.add_argument(
        "--data-dir", type=str, default=None,
        help=f"Path to PDF directory (default: {DEFAULT_DATA_DIR})",
    )
    args = parser.parse_args()
    data_dir = Path(args.data_dir) if args.data_dir else DEFAULT_DATA_DIR
    index_all(data_dir=data_dir, embed=args.embed)
