#!/bin/bash
set -e

echo "=== GCP Setup for RAG Pipeline ==="

if [ -z "$GCS_PROJECT_ID" ]; then
    read -p "Enter GCP Project ID: " GCS_PROJECT_ID
fi

if [ -z "$GCS_BUCKET_NAME" ]; then
    read -p "Enter GCS Bucket Name (will be created): " GCS_BUCKET_NAME
fi

GCS_REGION=${GCS_REGION:-"us-central1"}

echo ""
echo "Project: $GCS_PROJECT_ID"
echo "Bucket: $GCS_BUCKET_NAME"
echo "Region: $GCS_REGION"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "[1/4] Authenticating with gcloud..."
if command -v gcloud &> /dev/null; then
    gcloud auth login
    gcloud config set project "$GCS_PROJECT_ID"
else
    echo "ERROR: gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo ""
echo "[2/4] Enabling required APIs..."
gcloud services enable storage.googleapis.com --quiet
gcloud services enable iam.googleapis.com --quiet

echo ""
echo "[3/4] Creating GCS bucket (if not exists)..."
if gsutil ls -b "gs://$GCS_BUCKET_NAME" &> /dev/null; then
    echo "Bucket already exists: gs://$GCS_BUCKET_NAME"
else
    gsutil mb -p "$GCS_PROJECT_ID" -l "$GCS_REGION" "gs://$GCS_BUCKET_NAME"
    echo "Created bucket: gs://$GCS_BUCKET_NAME"
fi

echo ""
echo "[4/4] Creating service account..."
SA_NAME="rag-pipeline-sa"
SA_EMAIL="$SA_NAME@$GCS_PROJECT_ID.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --quiet 2>/dev/null; then
    echo "Service account already exists: $SA_EMAIL"
else
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="RAG Pipeline Service Account" \
        --description="For uploading PDFs to GCS from RunPod"
    echo "Created service account: $SA_EMAIL"
fi

echo ""
echo "Granting bucket access..."
gsutil iam ch serviceAccount:"$SA_EMAIL":objectAdmin "gs://$GCS_BUCKET_NAME"

echo ""
echo "Creating service account key..."
KEY_FILE="/tmp/gcs_sa_key.json"
gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --key-file-type=json

GCS_SA_KEY_JSON=$(cat "$KEY_FILE")
rm -f "$KEY_FILE"

echo ""
echo "=== Setup Complete ==="
echo "Add these to your .env:"
echo ""
echo "GCS_PROJECT_ID=$GCS_PROJECT_ID"
echo "GCS_BUCKET_NAME=$GCS_BUCKET_NAME"
echo ""
echo "GCS_SERVICE_ACCOUNT_JSON='$GCS_SA_KEY_JSON'"
echo ""