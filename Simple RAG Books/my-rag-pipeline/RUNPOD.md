# Remote GPU Indexing with RunPod

## Prerequisites
1. Sign up at [runpod.io](https://runpod.io)
2. Sign up at [qdrant.tech](https://qdrant.tech) (free tier)
3. GitHub repo with branch `simple-rag-books`

## Quick Deploy

### 1. Deploy code to RunPod
```bash
cd scripts
./deploy.sh <runpod_ip> <ssh_user> <ssh_key>
# Example: ./deploy.sh 213.173.99.39 root ~/.ssh/runpod_key -p 11107
```

### 2. Upload .env file
```bash
scp -i ~/.ssh/runpod_key -P <port> ./my-rag-pipeline/.env <user>@<ip>:/workspace/rag-pipeline/.env
```

### 3. Start the search API (auto-restart with supervisor)
```bash
# Install supervisor (one-time)
apt-get update && apt-get install -y supervisor

# Copy config (from config/supervisor/rag-api.conf)
# Or run manually:
cd /workspace/rag-pipeline
source venv/bin/activate
source .env
nohup python serve_search_api.py > server.log 2>&1 &
```

### 4. Get proxy URL
- Go to RunPod Dashboard → Your Pod → Endpoint tab
- Copy the proxy URL (e.g., `https://xxx-8080.proxy.runpod.net`)

### 5. Update frontend
Update `frontend/.env.local` with:
```
RUNPOD_URL=https://your-proxy-url
```

---

## Manual Setup (Step by Step)

### Step 1: Set up Qdrant Cloud
1. Go to Qdrant Cloud → create free cluster
2. Copy the **Cluster URL** (e.g., `https://xxx.eu-central-1-0.aws.cloud.qdrant.io`)
3. Copy the **API Key** from settings

### Step 2: Deploy RunPod
1. Log in to RunPod → **Deploy** → **Find Pod**
2. Search for "PyTorch" or use template: **PyTorch 2.4.0 → CUDA 12.4**
3. Configure:
   - GPU: RTX 3090 or 4090
   - Disk: 50GB+ (for PDFs and models)
4. Click **Deploy**

### Step 3: Upload Code & Environment
```bash
# Upload .env
scp -i ~/.ssh/runpod_key -P <port> .env user@ip:/workspace/rag-pipeline/.env

# Or upload entire folder
rsync -avz -e "ssh -i ~/.ssh/runpod_key -p <port>" ./my-rag-pipeline/ user@ip:/workspace/rag-pipeline/
```

### Step 4: Run the Search API
```bash
ssh -i ~/.ssh/runpod_key -p <port> user@ip
cd /workspace/rag-pipeline
source venv/bin/activate
source .env
python serve_search_api.py
```

### Step 5: Index Documents
```bash
# Upload PDFs to GCS
python upload_pdfs.py

# Index to Qdrant
python index_all.py
```

---

## Supervisor Setup (Auto-restart)

Install supervisor on RunPod:
```bash
apt-get install -y supervisor
```

Copy `config/supervisor/rag-api.conf` to `/etc/supervisor/conf.d/`

Start supervisor:
```bash
supervisord -c /etc/supervisor/supervisord.conf
supervisorctl start rag-api
```

---

## Troubleshooting
- If CUDA errors: Check `nvidia-smi` shows GPU
- If model errors: Ensure `device='cuda'` in embed_and_upsert.py
- If Qdrant errors: Verify API key and cluster URL
- Check server logs: `tail -f server.log`