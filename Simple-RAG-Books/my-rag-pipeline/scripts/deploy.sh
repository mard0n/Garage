#!/bin/bash

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <runpod_ip> <ssh_user> [path_to_ssh_key]"
  echo "Example: $0 123.45.67.89 root ~/.ssh/runpod"
  exit 1
fi

RUNPOD_IP="$1"
SSH_USER="$2"
SSH_KEY="${3:-}"

REPO_URL="https://github.com/mardonmashrag/simple-rag-books"
REPO_BRANCH="simple-rag-books"
DEPLOY_PATH="/workspace/rag-pipeline"

if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"
else
  SSH_OPTS="-o StrictHostKeyChecking=no"
fi

echo "Deploying to RunPod ($RUNPOD_IP)..."

echo "Creating deployment directory..."
ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP "mkdir -p $DEPLOY_PATH"

echo "Cloning repository..."
ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP "git clone -b $REPO_BRANCH $REPO_URL $DEPLOY_PATH"

echo "Installing system dependencies..."
ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP "apt-get update && apt-get install -y python3-pip git"

# echo "Installing Python packages in virtual environment..."
# ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP "cd $DEPLOY_PATH && [ ! -d venv ] && python3 -m venv venv || true && ./venv/bin/pip install -r requirements.txt"

# On RunPod, create venv in workspace
# cd /workspace/rag-pipeline
# python3 -m venv venv
# Activate and install
# source venv/bin/activate
# pip3 install -r requirements.txt

# Use scp (secure copy):
# scp -i ~/.ssh/runpod_key -P 11107 ./.env root@213.173.99.39:/workspace/Garage/Simple\ RAG\ Books/my-rag-pipeline/.env
# Or if you want to copy multiple env-related files:
# scp -i ~/.ssh/runpod_key -r ./my-rag-pipeline/.env root@213.173.99.39:/workspace/rag-pipeline/

echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Upload PDFs: scp -i $SSH_KEY ./documents/*.pdf $SSH_USER@$RUNPOD_IP:$DEPLOY_PATH/documents/"
echo "2. SSH into RunPod: ssh $SSH_USER@$RUNPOD_IP"
echo "3. Create .env file with your credentials:"
echo "   - QDRANT_URL"
echo "   - QDRANT_API_KEY"
echo "   - OPENROUTER_API_KEY"
echo "   - GCS_PROJECT_ID"
echo "   - GCS_BUCKET_NAME"
echo "   - GCS_SERVICE_ACCOUNT_JSON"
echo "4. Run: cd $DEPLOY_PATH && source .env && source venv/bin/activate && ./scripts/run_pipeline.sh"
echo ""
