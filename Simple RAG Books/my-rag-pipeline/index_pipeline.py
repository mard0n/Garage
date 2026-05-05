from chunk import chunk_document
from embed_and_upsert import embed_and_upsert
import glob
import json
import os

pdf_files = glob.glob('./documents/**/*.pdf', recursive=True)

output_dir = './chunks/'
os.makedirs(output_dir, exist_ok=True)

all_chunks = []
for pdf in pdf_files:
    print(f'Processing: {pdf}')
    chunks = chunk_document(pdf)
    all_chunks.extend(chunks)

print(f'Total chunks to index: {len(all_chunks)}')

json_path = os.path.join(output_dir, 'chunks.json')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(all_chunks, f, ensure_ascii=False, indent=2)
print(f'Saved chunks to {json_path}')

for i, chunk in enumerate(all_chunks):
    txt_path = os.path.join(output_dir, f'chunk_{i:04d}.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(chunk['text'])
print(f'Saved {len(all_chunks)} individual chunk files')

embed_and_upsert(all_chunks)

print('Indexing complete!')