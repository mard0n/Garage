from sentence_transformers import CrossEncoder

reranker = CrossEncoder('BAAI/bge-reranker-v2-m3', device='cpu')


def rerank(query: str, candidates: list[dict], top_n: int = 5) -> list[dict]:
    """Rerank candidates using BGE-Reranker-v2-m3."""
    pairs = [[query, c['text']] for c in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(
        zip(candidates, scores),
        key=lambda x: x[1],
        reverse=True
    )
    return [
        {**cand, 'rerank_score': float(score)}
        for cand, score in ranked[:top_n]
    ]