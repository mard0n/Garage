import json
import os
import re
import time
from pathlib import Path
from typing import Optional, Tuple

import fitz
from dotenv import load_dotenv
from google.cloud import storage
from google.oauth2 import service_account


def log_step(step_name: str):
    print(f"[parse_books] [{time.strftime('%H:%M:%S')}] {step_name}")
    import sys
    sys.stdout.flush()


log_step("Starting book parsing...")

env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

RAG_DATA_DIR = Path(__file__).parent.parent / "RAG Data"
METADATA_FILE = Path(__file__).parent / "book_metadata.json"

GCS_PROJECT_ID = os.getenv("GCS_PROJECT_ID")
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
GCS_SA_KEY_JSON = os.getenv("GCS_SERVICE_ACCOUNT_JSON")

THUMBNAIL_WIDTH = 400


def get_gcs_client():
    log_step("Connecting to GCS...")
    if not GCS_PROJECT_ID or not GCS_SA_KEY_JSON:
        raise ValueError("GCS_PROJECT_ID and GCS_SERVICE_ACCOUNT_JSON must be set in .env")

    log_step("Parsing service account JSON...")
    creds_dict = json.loads(GCS_SA_KEY_JSON)
    credentials = service_account.Credentials.from_service_account_info(creds_dict)

    log_step("Creating storage client...")
    return storage.Client(project=GCS_PROJECT_ID, credentials=credentials)


def get_bucket():
    log_step("Getting GCS bucket...")
    client = get_gcs_client()
    log_step(f"Getting bucket object: {GCS_BUCKET_NAME}")
    bucket = client.bucket(GCS_BUCKET_NAME)
    log_step("Checking bucket exists...")
    if not bucket.exists():
        raise ValueError(f"Bucket {GCS_BUCKET_NAME} does not exist")
    log_step("Bucket ready!")
    return bucket


def parse_filename(filename: str) -> Tuple[str, Optional[str]]:
    """Extract title and author from filename like 'Title - Author.pdf'"""
    name_without_ext = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)

    parts = name_without_ext.rsplit(" - ", 1)

    if len(parts) == 2:
        title, author = parts
        title = title.strip()
        author = author.strip()

        if not title:
            title = name_without_ext
            author = None
        elif not author:
            author = None

        return title, author
    else:
        return name_without_ext, None


def extract_thumbnail(pdf_path: Path, output_path: Path) -> bool:
    """Extract first page of PDF as thumbnail image"""
    try:
        doc = fitz.open(str(pdf_path))
        if doc.page_count == 0:
            print(f"  [WARN] No pages in {pdf_path.name}")
            doc.close()
            return False

        page = doc[0]
        mat = fitz.Matrix(THUMBNAIL_WIDTH / page.rect.width, THUMBNAIL_WIDTH / page.rect.width)
        pix = page.get_pixmap(matrix=mat)
        pix.save(str(output_path))
        doc.close()
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to extract thumbnail: {e}")
        return False


def upload_to_gcs(bucket, local_path: Path, blob_name: str, content_type: str) -> str:
    log_step(f"Uploading {blob_name}...")
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(str(local_path), content_type=content_type)
    log_step(f"Uploaded: {blob_name}")
    return f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{blob_name}"


def load_existing_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_metadata(metadata: dict):
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"[parse_books] Saved metadata to {METADATA_FILE}")


def process_books():
    log_step("Starting process_books...")
    bucket = get_bucket()

    log_step("Scanning RAG Data directory...")
    if not RAG_DATA_DIR.exists():
        log_step(f"ERROR: RAG Data directory not found: {RAG_DATA_DIR}")
        return

    log_step(f"RAG Data path: {RAG_DATA_DIR}")

    categories = ["Литература", "Учебник", "Монография", "Произведение президента"]

    pdf_files = []
    for category in categories:
        category_dir = RAG_DATA_DIR / category
        log_step(f"Scanning category: {category}")
        if category_dir.exists():
            log_step(f"  Found directory: {category_dir}")
            for pdf in category_dir.glob("*.pdf"):
                pdf_files.append((pdf, category))
                log_step(f"    + {pdf.name}")
            for pdf in category_dir.glob("**/*.pdf"):
                if pdf.name != ".DS_Store":
                    if (pdf, category) not in pdf_files:
                        pdf_files.append((pdf, category))
        else:
            log_step(f"  Directory not found: {category_dir}")

    log_step(f"Found {len(pdf_files)} PDF files in RAG Data")

    metadata = load_existing_metadata()
    processed = 0
    failed = 0

    for pdf_path, category in pdf_files:
        filename = pdf_path.name
        print(f"\n[Processing] {filename} ({category})")

        if filename in metadata:
            print(f"  Already processed, skipping")
            processed += 1
            continue

        title, author = parse_filename(filename)
        print(f"  Title: {title}, Author: {author}")

        try:
            pdf_blob_name = f"books/{filename}"
            pdf_gcs_url = upload_to_gcs(bucket, pdf_path, pdf_blob_name, "application/pdf")

            thumbnail_filename = f"{Path(filename).stem}.png"
            thumbnail_blob_name = f"thumbnails/{thumbnail_filename}"
            temp_thumbnail = Path("/tmp") / thumbnail_filename

            thumbnail_success = extract_thumbnail(pdf_path, temp_thumbnail)

            if thumbnail_success:
                thumbnail_gcs_url = upload_to_gcs(
                    bucket, temp_thumbnail, thumbnail_blob_name, "image/png"
                )
                temp_thumbnail.unlink(missing_ok=True)
            else:
                thumbnail_gcs_url = None

            metadata[filename] = {
                "title": title,
                "author": author,
                "category": category,
                "pdf_gcs_url": pdf_gcs_url,
                "thumbnail_gcs_url": thumbnail_gcs_url,
                "pdf_blob_name": pdf_blob_name,
                "thumbnail_blob_name": thumbnail_blob_name if thumbnail_success else None,
                "local_path": str(pdf_path),
            }

            save_metadata(metadata)
            print(f"  Done! (saved)")
            processed += 1

        except Exception as e:
            print(f"  [ERROR] Failed to process: {e}")
            failed += 1
            continue
    print(f"\n[parse_books] Complete: {processed} processed, {failed} failed")
    print(f"[parse_books] Total books in metadata: {len(metadata)}")


if __name__ == "__main__":
    print("\n=== Starting Book Parsing ===\n")
    process_books()
    print("\n=== Parsing Complete ===\n")