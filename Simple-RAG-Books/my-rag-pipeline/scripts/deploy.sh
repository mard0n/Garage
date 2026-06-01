#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <runpod_ip> <ssh_user> [path_to_ssh_key] [ssh_port]"
  echo "Example: $0 123.45.67.89 root ~/.ssh/runpod 11107"
  exit 1
fi

RUNPOD_IP="$1"
SSH_USER="$2"
SSH_KEY="${3:-}"
SSH_PORT="${4:-22}"
DEPLOY_PATH="/workspace/rag-pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"

if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="-i $SSH_KEY -p $SSH_PORT -o StrictHostKeyChecking=no"
else
  SSH_OPTS="-p $SSH_PORT -o StrictHostKeyChecking=no"
fi

echo "Deploying to RunPod ($RUNPOD_IP:$SSH_PORT)..."

echo "Creating deployment directory..."
ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP "mkdir -p $DEPLOY_PATH"

echo "Syncing code via rsync..."
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude='.venv' --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.ruff_cache' --exclude='qdrant_storage' --exclude='.env' \
  --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='.DS_Store' \
  --exclude='chunks/' --exclude='*.log' \
  "$PIPELINE_DIR/" \
  "$SSH_USER@$RUNPOD_IP:$DEPLOY_PATH"

echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. SSH into RunPod: ssh $SSH_OPTS $SSH_USER@$RUNPOD_IP"
echo "2. Upload .env file:"
echo "   scp $SSH_OPTS $PIPELINE_DIR/.env $SSH_USER@$RUNPOD_IP:$DEPLOY_PATH/.env"
echo "3. Copy RAG Data PDFs:"
echo "   rsync -avz -e 'ssh $SSH_OPTS' $PIPELINE_DIR/../RAG\\ Data/ $SSH_USER@$RUNPOD_IP:$DEPLOY_PATH/rag_data/"
echo "4. On RunPod:"
echo "   cd $DEPLOY_PATH && python3 -m venv venv && source venv/bin/activate"
echo "   source .env && pip install -r requirements.txt"
echo "   python index_all.py --embed"
echo "   nohup python serve_search_api.py > server.log 2>&1 &"
echo ""
