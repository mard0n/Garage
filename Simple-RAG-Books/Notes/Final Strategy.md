Extract stage 
- Docling 
	- Clean text: Remove Headers/Footers + Fix line breaks + Fix hyphenation

Transform 
- Chonkie 
	- Document-Structure-Based + Recursive fallback. 
	- Keep source + page number in metadata

Embedding 
- BGE-M3

Vector Database 
- Local Qdrant

Query 
- Query Expansion, HyDE (Hypothetical Document Embeddings) vs Multi-query retrieval 
- Hybrid Retrieval. Dense Search + Sparse Search + Reciprocal Rank Fusion 
- Context Expansion (Parent-Document Retrieval) 
- The Reranker. BGE-Reranker-v2-m3