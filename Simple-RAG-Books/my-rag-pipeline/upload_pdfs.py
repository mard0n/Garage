import json
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from google.cloud import storage
from google.oauth2 import service_account

print("[upload_pdfs] Starting PDF upload to GCS...")

env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

DOCUMENTS_DIR = Path(__file__).parent / "documents"
METADATA_FILE = Path(__file__).parent / "book_metadata.json"

GCS_PROJECT_ID = os.getenv("GCS_PROJECT_ID")
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
GCS_SA_KEY_JSON = os.getenv("GCS_SERVICE_ACCOUNT_JSON")

print(f"[upload_pdfs] GCS Project: {GCS_PROJECT_ID}")
print(f"[upload_pdfs] GCS Bucket: {GCS_BUCKET_NAME}")
print(f"[upload_pdfs] Documents dir: {DOCUMENTS_DIR}")
print(f"[upload_pdfs] Metadata file: {METADATA_FILE}\n")


def get_gcs_client():
    print("[upload_pdfs] Connecting to GCS...")
    if not GCS_PROJECT_ID or not GCS_SA_KEY_JSON:
        raise ValueError(
            "GCS_PROJECT_ID and GCS_SERVICE_ACCOUNT_JSON must be set in .env"
        )

    creds_dict = json.loads(GCS_SA_KEY_JSON)
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    client = storage.Client(project=GCS_PROJECT_ID, credentials=credentials)
    print("[upload_pdocs] Connected to GCS successfully")
    return client


def get_bucket():
    print(f"[upload_pdfs] Getting bucket: {GCS_BUCKET_NAME}")
    client = get_gcs_client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    if not bucket.exists():
        print(f"[upload_pdfs] Bucket does not exist, creating...")
        bucket = client.create_bucket(GCS_BUCKET_NAME, location="us-central1")
        print(f"Created bucket: gs://{GCS_BUCKET_NAME}")
    print(f"[upload_pdfs] Using bucket: gs://{GCS_BUCKET_NAME}")
    return bucket


def upload_pdfs() -> dict[str, str]:
    bucket = get_bucket()

    if not DOCUMENTS_DIR.exists():
        print(f"ERROR: Documents directory not found: {DOCUMENTS_DIR}")
        sys.exit(1)

    pdf_files = list(DOCUMENTS_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {DOCUMENTS_DIR}")
        sys.exit(1)

    metadata = {}

    for pdf_path in pdf_files:
        filename = pdf_path.name
        blob_name = f"books/{filename}"
        blob = bucket.blob(blob_name)

        if blob.exists():
            print(f"Already exists: gs://{GCS_BUCKET_NAME}/{blob_name}, skipping upload")
        else:
            print(f"Uploading: {filename}...")
            blob.upload_from_filename(str(pdf_path), content_type="application/pdf")
            print(f"Uploaded: gs://{GCS_BUCKET_NAME}/{blob_name}")

        gcs_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{blob_name}"
        metadata[filename] = {
            "gcs_url": gcs_url,
            "local_path": str(pdf_path),
            "blob_name": blob_name,
        }

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\nSaved metadata to {METADATA_FILE}")
    print(f"Total books uploaded: {len(metadata)}")

    return metadata


if __name__ == "__main__":
    print("\n=== Starting PDF Upload ===\n")
    upload_pdfs()
    print("\n=== Upload Complete ===\n")