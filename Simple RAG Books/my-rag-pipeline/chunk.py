from chonkie import RecursiveChunker, RecursiveRules, RecursiveLevel, OverlapRefinery
from transformers import AutoTokenizer

# Load BGE-M3 tokenizer
tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-m3")

# Custom rules: paragraph → sentence → word (fallback)
rules = RecursiveRules(levels=[
    RecursiveLevel(delimiters=["\n\n"]),
    RecursiveLevel(delimiters=[". ", "? ", "! "]),
    RecursiveLevel(whitespace=True),
])

chunker = RecursiveChunker(
    tokenizer=tokenizer,
    chunk_size=500,
    rules=rules,
    min_characters_per_chunk=24,
)

overlap_refinery = OverlapRefinery(
    context_size=100,
    tokenizer=tokenizer,
    mode="suffix",
    merge_context=True,
)

def get_page_for_position(text: str, position: int, page_boundaries: list[int]) -> int:
    """Get page number for a character position."""
    for i, boundary in enumerate(page_boundaries):
        if position < boundary:
            return i + 1
    return len(page_boundaries)


def chunk_document(doc_data: dict, window_size: int = 2000, stride: int = 500) -> list[dict]:
    """Chunk document with sliding window, tracking page spans."""
    text = doc_data["text"]
    source = doc_data["source"]
    num_pages = doc_data["num_pages"]

    total_tokens = len(tokenizer.encode(text))

    if total_tokens <= window_size:
        raw_chunks = chunker.chunk(text)
        refined_chunks = overlap_refinery(raw_chunks)
    else:
        all_refined_chunks = []
        for start in range(0, total_tokens, stride):
            end = min(start + window_size, total_tokens)
            window_text = tokenizer.decode(tokenizer.encode(text)[start:end])

            raw_chunks = chunker.chunk(window_text)
            refined_chunks = overlap_refinery(raw_chunks)

            for chunk in refined_chunks:
                chunk.start_token = start + chunk.start_index
                chunk.end_token = start + chunk.end_index

            all_refined_chunks.extend(refined_chunks)

        refined_chunks = all_refined_chunks

    page_boundaries = []
    if num_pages > 1:
        chars_per_page = len(text) / num_pages
        for p in range(1, num_pages):
            page_boundaries.append(int(p * chars_per_page))

    results = []
    for i, chunk in enumerate(refined_chunks):
        char_start = chunk.start_index
        char_end = chunk.end_index

        start_page = get_page_for_position(text, char_start, page_boundaries) if page_boundaries else 1
        end_page = get_page_for_position(text, char_end, page_boundaries) if page_boundaries else num_pages

        if start_page == end_page:
            page_range = str(start_page)
        else:
            page_range = f"{start_page}-{end_page}"

        results.append({
            "text": chunk.text,
            "metadata": {
                "source": source,
                "pages": page_range,
                "chunk_index": i,
                "strategy": "recursive_with_overlap",
            },
        })

    return results