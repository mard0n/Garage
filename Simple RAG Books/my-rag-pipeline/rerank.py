from FlagEmbedding import FlagReranker

reranker = FlagReranker(
    'BAAI/bge-reranker-v2-m3',
    use_fp16=False,
)

def rerank(query: str, candidates: list[dict], top_n: int = 5) -> list[dict]:
    """Rerank candidates using BGE-Reranker-v2-m3."""
    pairs = [[query, c['text']] for c in candidates]
    scores = reranker.compute_score(pairs, normalize=True)
    ranked = sorted(
        zip(candidates, scores),
        key=lambda x: x[1],
        reverse=True
    )
    return [
        {**cand, 'rerank_score': score}
        for cand, score in ranked[:top_n]
    ]