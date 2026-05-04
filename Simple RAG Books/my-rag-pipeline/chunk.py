from chonkie import RecursiveChunker, RecursiveRules, RecursiveLevel
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-m3")

rules = RecursiveRules(levels=[
    RecursiveLevel(delimiters=["\n\n"]),
    RecursiveLevel(delimiters=[". ", "? ", "! "]),
    RecursiveLevel(whitespace=True),
])

chunker = RecursiveChunker(
    tokenizer=tokenizer,
    chunk_size=512,
    rules=rules,
    min_characters_per_chunk=50,
)

def get_page_for_position(text: str, position: int, page_boundaries: list[int]) -> int:
    """Get page number for a character position."""
    for i, boundary in enumerate(page_boundaries):
        if position < boundary:
            return i + 1
    return len(page_boundaries)


def chunk_document(doc_data: dict) -> list[dict]:
    """Chunk document without sliding windows or overlap."""
    text = doc_data["text"]
    source = doc_data["source"]
    num_pages = doc_data["num_pages"]

    raw_chunks = chunker.chunk(text)

    page_boundaries = []
    if num_pages > 1:
        chars_per_page = len(text) / num_pages
        for p in range(1, num_pages):
            page_boundaries.append(int(p * chars_per_page))

    results = []
    for i, chunk in enumerate(raw_chunks):
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
                "strategy": "recursive",
            },
        })

    return results