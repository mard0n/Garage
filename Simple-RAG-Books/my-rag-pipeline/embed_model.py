from FlagEmbedding import BGEM3FlagModel, FlagReranker

model = BGEM3FlagModel(
    "BAAI/bge-m3",
    use_fp16=False,
    device="cpu",
)

reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=False, device="cpu")
