import time

import fitz
import torch
from docling.chunking import HybridChunker
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer

print(f"  PyTorch device: {'mps' if torch.backends.mps.is_available() else 'cpu'}")

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = False
pipeline_options.do_table_structure = True

converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
)

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


def chunk_document(file_path: str, title: str) -> list[dict]:
    needs_ocr = "needsocr" in title.lower()

    doc = fitz.open(file_path)
    page_count = len(doc)
    doc.close()

    print(f"  OCR needed: {needs_ocr} ({page_count} pages)")

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = needs_ocr
    pipeline_options.do_table_structure = True

    if needs_ocr:
        print(f"  OCR enabled - will process {page_count} pages...")

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    start_time = time.time()
    result = converter.convert(source=file_path)
    convert_time = time.time() - start_time

    avg_time_per_page = convert_time / page_count if page_count > 0 else 0
    print(f"  Converted in {convert_time:.1f}s ({avg_time_per_page:.2f}s/page)")

    doc = result.document

    raw_chunks = chunker.chunk(dl_doc=doc)

    results = []
    for i, chunk in enumerate(raw_chunks):
        page_range = get_page_range(chunk)

        results.append(
            {
                "text": chunker.contextualize(chunk),
                "metadata": {
                    "source": file_path,
                    "pages": page_range,
                    "chunk_index": i,
                    "strategy": "docling_hybrid",
                },
            }
        )

    return results
