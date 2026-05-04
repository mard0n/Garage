from extract import extract_document
from chunk import chunk_document
from embed_and_upsert import embed_and_upsert
import glob

pdf_files = glob.glob('./documents/**/*.pdf', recursive=True)

all_chunks = []
for pdf in pdf_files:
    print(f'Processing: {pdf}')
    doc_data = extract_document(pdf)
    chunks = chunk_document(doc_data)
    all_chunks.extend(chunks)

print(f'Total chunks to index: {len(all_chunks)}')

# embed_and_upsert(all_chunks)

print('Indexing complete!')