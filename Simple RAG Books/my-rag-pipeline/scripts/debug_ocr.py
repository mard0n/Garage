import sys
sys.path.insert(0, ".")
from chunk import chunk_document

pdf = "documents/Программирование - Учебник.pdf"
title = "Программирование - Учебник"

print(f"Testing OCR on: {pdf}")
result = chunk_document(pdf, title, debug=True)
print(f"Chunks created: {len(result)}")

if result:
    print(f"First chunk text (500 chars):")
    print(result[0]["text"][:500])
else:
    print("No chunks created!")