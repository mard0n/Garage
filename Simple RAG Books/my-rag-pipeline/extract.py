from docling.document_converter import DocumentConverter
import re

def clean_text(text: str) -> str:
    # Fix soft hyphenation (word-\nbreak -> wordbreak)
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    # Fix broken line breaks inside sentences
    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)
    # Collapse multiple spaces
    text = re.sub(r' +', ' ', text)
    return text.strip()

converter = DocumentConverter()

def extract_document(file_path: str) -> dict:
    """Extract entire document as one text block with metadata."""
    result = converter.convert(file_path)
    doc = result.document
    
    full_text = doc.export_to_markdown()
    full_text = clean_text(full_text)
    
    return {
        "text": full_text,
        "source": file_path,
        "num_pages": len(doc.pages),
    }