import os
from hybrid_search import hybrid_search
from hyde import hyde_query_vector, generate_hypothetical_answer
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel(
    'BAAI/bge-m3',
    use_fp16=False,   # CPU doesn't benefit from fp16
    device='cpu',      # Changed from 'cuda'
)

def answer_query(question: str, use_hyde: bool = True) -> list[dict]:
    """Answer a question using HyDE + hybrid search (+ reranking)."""
    try:
        if use_hyde:
            output = hyde_query_vector(question)
        else:
            output = model.encode(
                [question],
                max_length=1024,
                return_dense=True,
                return_sparse=True,
                return_colbert_vecs=False,
            )
    except Exception as e:
        print(f"HyDE failed: {e}, falling back to raw query")
        output = model.encode(
            [question],
            max_length=1024,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
    candidates = hybrid_search(output, top_k=20)
    return candidates


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        query = ' '.join(sys.argv[1:])
    else:
        query = input("Enter your question: ")
    results = answer_query(query)
    print(f"\n{'=' * 60}")
    print(f"Question: {query}")
    print(f"{'=' * 60}\n")
    for i, r in enumerate(results):
        print(f"--- Result {i + 1} (score: {r.get('score', 0):.3f}) ---")
        print(f"Source: {r['metadata'].get('source', 'N/A')}")
        print(f"Pages: {r['metadata'].get('pages', 'N/A')}")
        print(r['text'][:300] + "..." if len(r['text']) > 300 else r['text'])
        print()