import re

import fitz
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

tokenizer_path = hf_hub_download(repo_id="BAAI/bge-m3", filename="tokenizer.json")
_tokenizer = Tokenizer.from_file(tokenizer_path)
MAX_TOKENS = 512


def get_page_range(chunk_metadata: dict) -> str:
    pages = chunk_metadata.get("pages", [])
    if not pages:
        return "1"
    page_start = min(pages)
    page_end = max(pages)
    if page_start == page_end:
        return str(page_start)
    return f"{page_start}-{page_end}"


def clean_text(text: str) -> str:
    text = re.sub(r'(\w)\s+-\s*(\w)', r'\1\2', text)
    text = re.sub(r'(\w)\s*-\s+(\w)', r'\1\2', text)
    text = re.sub(r'(?<=\w) \. (?=\w)', '.', text)
    text = re.sub(r'«\s+', '«', text)
    text = re.sub(r'\s+»', '»', text)
    text = re.sub(r'"\s+', '"', text)
    text = re.sub(r'\s+"', '"', text)
    text = re.sub(r'\s+—\s+', ' — ', text)
    text = re.sub(r'\s+–\s+', ' – ', text)
    text = re.sub(r' {2,}', ' ', text).strip()
    text = re.sub(r'[ˈʽʼʿ]+', '', text)
    return text


def count_tokens(text: str) -> int:
    return len(_tokenizer.encode(text).ids)


def chunk_text(text: str, title: str = "", page_num: int = 1) -> list[dict]:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current_text = ""
    current_tokens = 0
    chunk_index = 0
    pages_used = set()

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        sentence_tokens = count_tokens(sentence)

        if current_tokens + sentence_tokens > MAX_TOKENS and current_text:
            chunks.append({
                "text": clean_text(current_text.strip()),
                "metadata": {
                    "source": title,
                    "pages": get_page_range({"pages": list(pages_used) if pages_used else [page_num]}),
                    "chunk_index": chunk_index,
                    "strategy": "pymupdf_sentence_split",
                },
            })
            chunk_index += 1
            current_text = ""
            current_tokens = 0
            pages_used = set()

        current_text += " " + sentence
        current_tokens += sentence_tokens
        pages_used.add(page_num)

    if current_text.strip():
        chunks.append({
            "text": clean_text(current_text.strip()),
            "metadata": {
                "source": title,
                "pages": get_page_range({"pages": list(pages_used) if pages_used else [page_num]}),
                "chunk_index": chunk_index,
                "strategy": "pymupdf_sentence_split",
            },
        })

    return chunks


def is_pdf_scanned_image(file_path: str, threshold: int = 50) -> bool:
    doc = fitz.open(file_path)
    has_text = False
    for page_num in range(min(doc.page_count, 3)):
        page = doc[page_num]
        text = page.get_text()
        if text and len(text.strip()) > threshold:
            has_text = True
            break
    doc.close()
    return not has_text


def chunk_document(file_path: str, title: str = "") -> list[dict]:
    doc = fitz.open(file_path)
    all_chunks = []
    chunk_index = 0

    for page_num in range(doc.page_count):
        page = doc[page_num]
        text = page.get_text()

        if text and len(text.strip()) > 20:
            page_chunks = chunk_text(text, title=title, page_num=page_num + 1)
            for pc in page_chunks:
                pc["metadata"]["chunk_index"] = chunk_index
                pc["metadata"]["source"] = title or file_path
                all_chunks.append(pc)
                chunk_index += 1

    doc.close()

    if not all_chunks:
        print(f"  WARNING: No text extracted from {file_path}")

    return all_chunks
