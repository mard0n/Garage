import os

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:False")

import torch
from FlagEmbedding import BGEM3FlagModel, FlagReranker

device = "cuda" if torch.cuda.is_available() else "cpu"
use_fp16 = device == "cuda"

model = BGEM3FlagModel(
    "BAAI/bge-m3",
    use_fp16=use_fp16,
    device=device,
)

reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=use_fp16, device=device)
