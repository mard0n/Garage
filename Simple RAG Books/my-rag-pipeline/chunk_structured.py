import re
import json
import os
from pathlib import Path
from docling.document_converter import DocumentConverter
import fitz


def clean_text(text: str) -> str:
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)
    text = re.sub(r' +', ' ', text)
    return text.strip()


def get_page_for_position(pdf_path: str, char_pos: int) -> int:
    """Get page number (1-indexed) for a character position in the original PDF."""
    doc = fitz.open(pdf_path)
    total_chars = 0
    for page_num, page in enumerate(doc):
        page_text = page.get_text()
        page_chars = len(page_text)
        if char_pos < total_chars + page_chars:
            return page_num + 1
        total_chars += page_chars
    return len(doc)


def parse_markdown_headers(text: str) -> list[tuple[int, str]]:
    """Find all markdown headers with their positions."""
    headers = []
    for match in re.finditer(r'^(#{1,6})\s+(.+)$', text, re.MULTILINE):
        level = len(match.group(1))
        title = match.group(2).strip()
        headers.append((match.start(), level, title))
    return headers


def get_parent_titles(text: str, pos: int) -> list[str]:
    """Get all parent headers for a given position."""
    headers = parse_markdown_headers(text)
    parents = []
    for i in range(len(headers) - 1):
        if headers[i][0] <= pos < headers[i + 1][0]:
            parents.append(headers[i][2])
            for j in range(i - 1, -1, -1):
                if headers[j][1] < headers[i][1]:
                    parents.insert(0, headers[j][2])
                    break
            break
    else:
        for h in reversed(headers):
            if h[0] <= pos:
                parents = [h[2]]
                break
    return parents


def split_into_sentences(text: str) -> list[str]:
    """Split text at sentence boundaries (., ?, !) keeping delimiters."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s for s in sentences if s.strip()]


def chunk_paragraph(text: str, max_chars: int = 800) -> list[str]:
    """Split a paragraph into chunks at sentence boundaries."""
    if len(text) <= max_chars:
        return [text]

    chunks = []
    sentences = split_into_sentences(text)
    current = ""

    for sent in sentences:
        if len(current) + len(sent) + 1 > max_chars and current:
            chunks.append(current.strip())
            current = sent
        else:
            current = (current + " " + sent).strip()

    if current:
        chunks.append(current.strip())

    return chunks if chunks else [text[:max_chars]]


def extract_document(file_path: str) -> dict:
    """Extract document with page-aware processing."""
    converter = DocumentConverter()
    result = converter.convert(file_path)
    doc = result.document

    full_text = doc.export_to_markdown()
    full_text = clean_text(full_text)

    return {
        "text": full_text,
        "source": file_path,
        "num_pages": len(doc.pages),
    }


def chunk_document(doc_data: dict) -> list[dict]:
    """Chunk document by paragraphs, with parent titles, splitting long paragraphs."""
    text = doc_data["text"]
    source = doc_data["source"]
    pdf_path = source.replace("./documents/", "/app/documents/")

    header_pattern = r'^#{1,6}\s+.+$'
    lines = text.split('\n')

    paragraphs = []
    current_para = []
    in_code_block = False

    header_pattern = r'^#{1,6}\s+'

    for line in lines:
        if line.strip().startswith('```'):
            in_code_block = not in_code_block
            current_para.append(line)
            continue

        if in_code_block:
            current_para.append(line)
            continue

        is_header = line.strip().startswith('#') and bool(re.match(r'^#{1,6}\s+', line))

        if is_header:
            if current_para:
                para_text = '\n'.join(current_para).strip()
                if para_text:
                    paragraphs.append(para_text)
            current_para = [line]
        elif line.strip() == '':
            if current_para:
                para_text = '\n'.join(current_para).strip()
                if para_text:
                    paragraphs.append(para_text)
                current_para = []
        else:
            current_para.append(line)

    if current_para:
        para_text = '\n'.join(current_para).strip()
        if para_text:
            paragraphs.append(para_text)

    print(f"  [{os.path.basename(source)}] Extracted {len(paragraphs)} paragraphs")
    for i, p in enumerate(paragraphs):
        preview = p.replace('\n', ' ')[:60]
        print(f"    {i}: {preview}...")

    merged_paragraphs = []
    i = 0
    while i < len(paragraphs):
        para = paragraphs[i]
        if len(para) < 50 and i + 1 < len(paragraphs):
            merged = para + " " + paragraphs[i + 1]
            merged_paragraphs.append(merged)
            print(f"  MERGE: para[{i}] len={len(para)} + para[{i+1}] = {len(merged)}")
            i += 2
        else:
            merged_paragraphs.append(para)
            i += 1

    print(f"  [{os.path.basename(source)}] After merge: {len(merged_paragraphs)} paragraphs")

    chunks = []
    global_idx = 0

    for idx, para in enumerate(merged_paragraphs):
        print(f"  PROCESSING para[{idx}]")
        para_start = text.find(para[:50])
        if para_start == -1:
            para_start = 0

        parent_titles = get_parent_titles(text, para_start)

        header_match = re.match(r'^#{1,6}\s+(.+)$', para)
        if header_match:
            title = header_match.group(1).strip()
            remaining = para[len(header_match.group(0)):].strip()
            if not remaining:
                continue
            clean_para = remaining
            if clean_para.startswith(title[:20]):
                clean_para = clean_para[len(title):].strip()
        else:
            clean_para = re.sub(r'^#{1,6}\s+', '', para).strip()

        is_list = bool(re.match(r'^\s*[-*]\s+', para)) or bool(re.match(r'^\s*\d+\.\s+', para))
        
        print(f"    [{i}] raw_len={len(para)}, clean_len={len(clean_para)}, is_list={is_list}")

        if len(clean_para) < 20 and not is_list:
            print(f"      -> FILTERED (too short)")
            continue
        
        print(f"      -> KEEP")

        sub_chunks = chunk_paragraph(clean_para, max_chars=800)

        for j, chunk_text in enumerate(sub_chunks):
            chunk_start_in_para = text.find(chunk_text, para_start)
            if chunk_start_in_para == -1:
                chunk_start_in_para = para_start

            try:
                page_start = get_page_for_position(pdf_path, chunk_start_in_para)
            except:
                page_start = 1

            page_end = page_start
            chunk_len = len(chunk_text)
            try:
                page_end = get_page_for_position(pdf_path, chunk_start_in_para + chunk_len)
            except:
                pass

            if page_start == page_end:
                page_range = str(page_start)
            else:
                page_range = f"{page_start}-{page_end}"

            continuation = None if j == 0 else global_idx - 1

            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "source": source,
                    "pages": page_range,
                    "page_start": page_start,
                    "page_end": page_end,
                    "chunk_index": global_idx,
                    "parent_titles": parent_titles,
                    "continuation": continuation,
                    "strategy": "paragraph"
                }
            })
            global_idx += 1

    return chunks


def process_documents(doc_dir: str = "/app/documents", output_path: str = "/app/chunks/chunks.json") -> list[dict]:
    """Process all documents in directory."""
    doc_files = []
    for f in Path(doc_dir).glob("*.pdf"):
        doc_files.append(str(f))

    doc_files.sort()

    all_chunks = []

    for file_path in doc_files:
        print(f"Processing: {file_path}")
        rel_path = "./documents/" + os.path.basename(file_path)

        doc_data = extract_document(file_path)
        doc_data["source"] = rel_path

        chunks = chunk_document(doc_data)
        all_chunks.extend(chunks)
        print(f"  -> {len(chunks)} chunks")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_chunks, f, indent=2, ensure_ascii=False)

    print(f"\nTotal chunks: {len(all_chunks)}")
    print(f"Saved to: {output_path}")

    return all_chunks


if __name__ == "__main__":
    process_documents()