from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer

converter = DocumentConverter()

tokenizer = HuggingFaceTokenizer(
    tokenizer=AutoTokenizer.from_pretrained("BAAI/bge-m3"),
    max_tokens=512,
)

chunker = HybridChunker(tokenizer=tokenizer)

def get_page_range(chunk) -> str:
    page_start = None
    page_end = None

    for item in chunk.meta.doc_items:
        if hasattr(item, "prov") and item.prov:
            for prov in item.prov:
                if hasattr(prov, "page_no") and prov.page_no:
                    if page_start is None:
                        page_start = prov.page_no
                    page_end = prov.page_no

    if page_start is None:
        page_start = 1
    if page_end is None:
        page_end = page_start

    if page_start == page_end:
        page_range = str(page_start)
    else:
        page_range = f"{page_start}-{page_end}"

    return page_range
    

def chunk_document(file_path: str) -> list[dict]:
    result = converter.convert(source=file_path)
    doc = result.document

    raw_chunks = chunker.chunk(dl_doc=doc)

    results = []
    for i, chunk in enumerate(raw_chunks):
        page_range = get_page_range(chunk)

        results.append({
            "text": chunker.contextualize(chunk),
            "metadata": {
                "source": file_path,
                "pages": page_range,
                "chunk_index": i,
                "strategy": "docling_hybrid",
            },
        })

    return results