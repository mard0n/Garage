# Remote GPU Indexing with RunPod

## Prerequisites
1. Sign up at [runpod.io](https://runpod.io)
2. Sign up at [qdrant.tech](https://qdrant.tech) (free tier)

## Step 1: Set up Qdrant Cloud
1. Go to Qdrant Cloud → create free cluster
2. Copy the **Cluster URL** (e.g., `https://xxx.eu-central-1-0.aws.cloud.qdrant.io`)
3. Copy the **API Key** from settings

## Step 2: Deploy RunPod
1. Log in to RunPod → **Deploy** → **Find Pod**
2. Search for "PyTorch" or use template: **PyTorch 2.4.0 → CUDA 12.4**
3. Configure:
   - GPU: RTX 3090 or 4090
   - Disk: 50GB+ (for PDFs and models)
4. Click **Deploy**

## Step 3: Connect to RunPod
```bash
# Get connection info from RunPod console
# Use the SSH command provided
```

## Step 4: Set up environment
```bash
# Install git and clone your repo
apt update && apt install -y git
git clone https://github.com/your-repo/my-rag-pipeline.git
cd my-rag-pipeline

# Or upload files via RunPod file manager
```

## Step 5: Configure Qdrant Cloud
```bash
export QDRANT_URL="https://your-cluster.eu-central-1-0.aws.cloud.qdrant.io"
export QDRANT_API_KEY="your-api-key"
export OPENROUTER_API_KEY="your-openrouter-key"
```

## Step 6: Run Indexing
```bash
python index_pipeline.py
```

## Step 7: Test Query
```bash
python query_pipeline.py "Your question here"
```

## Cleanup
1. Terminate RunPod instance (stops billing)
2. Qdrant Cloud free tier keeps cluster active

## Troubleshooting
- If CUDA errors: Check `nvidia-smi` shows GPU
- If model errors: Ensure `device='cuda'` in embed_and_upsert.py
- If Qdrant errors: Verify API key and cluster URL