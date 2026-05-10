# OpenAI Suggestion
## 🧠 1) The Basic Retrieval Flow (Foundation)

At query time:

1. User asks a question
2. Convert query → embedding
3. Search vector DB → top-K chunks
4. (Optional) rerank
5. Send to LLM → answer

Sounds simple—but the quality depends on _how_ you do each step.

---

## 🔍 2) Query Processing (Underrated Step)

Before embedding the query, improve it.

### What you can do:

### A. Normalize text (important for Russian)

- lowercase
- remove noise
- normalize punctuation

---

### B. Query expansion (huge boost)

Use LLM to expand:

**User query:**

> “налоговые льготы”

**Expanded internally:**

- “налоговые льготы в России”
- “виды налоговых льгот”
- “освобождение от налогов”

👉 This improves recall significantly

---

### C. Multi-query retrieval (very powerful)

Generate 2–4 variations of the query and search all of them.

Frameworks like LlamaIndex and LangChain support this.

---

## 📦 3) Retrieval Strategy (Core Logic)

### A. Top-K selection

Start with:

- **K = 3–5**

Too high:

- noise

Too low:

- missing context

---

### B. Similarity threshold

Don’t blindly trust top-K.

Add a cutoff:

- discard chunks below similarity threshold

👉 Prevents garbage context

---

### C. Metadata filtering

Since you stored:

- page numbers
- document names

You can filter like:

- only specific book
- only certain section

This is where DBs like Qdrant shine.

---

## ⚖️ 4) Hybrid Search (Highly Recommended for Russian)

Vector search alone is not enough.

Combine:

- semantic search (embeddings)
- keyword search (BM25)

Tools:

- Elasticsearch
- or hybrid mode in Qdrant

---

### Why this matters:

Russian queries often include:

- exact terms
- legal phrases
- names

👉 keyword search catches what embeddings miss

---

## 🧠 5) Reranking (BIGGEST QUALITY BOOST)

After retrieving top-K, rerank them using a stronger model.

### How:

1. Retrieve top 10 chunks
2. Pass to reranker
3. Select best 3–5

---

### Tools:

- cross-encoders (BGE reranker, etc.)
- Cohere rerank API

---

### Why it works:

Vector search = fast but approximate  
Reranker = slow but precise

👉 combination = best results

---

## 🧩 6) Context Construction (What You Send to LLM)

Don’t just dump chunks randomly.

### Good structure:

Source: book1.pdf, page 12–13  
[chunk text]  
  
Source: book2.pdf, page 45  
[chunk text]

👉 helps model:

- reason better
- cite sources

---

## Add instructions:

Answer based ONLY on provided context.  
If unsure, say you don't know.

---

## 🔁 7) Iterative Retrieval (Advanced but Powerful)

If first retrieval fails:

1. LLM reformulates query
2. search again
3. merge results

👉 useful for:

- vague queries
- complex questions

---

## 🧠 8) Handling Long Answers / Books

For book-based systems:

### Option: hierarchical retrieval

1. retrieve chunks
2. group by document
3. expand around best chunk (neighbor chunks)

👉 preserves context better

---

## 📊 9) Evaluation (Most People Skip This)

You should test:

- Does correct chunk appear in top-5?
- Is answer grounded in retrieved text?

Create a small dataset:

Q: ...  
Expected source: book X page Y

👉 measure retrieval accuracy

---

## 🚀 10) Recommended Setup (Your Case)

For Russian PDFs:

### Retrieval pipeline:

1. Query → normalize
2. Generate 2–3 query variations
3. Embed all queries
4. Retrieve top 5 per query
5. Merge + deduplicate
6. Rerank top 10 → pick best 5
7. Send to LLM

# Gemini Suggestion

### 1. The Query Transformation (Don't use the "Raw" Query)

Users rarely ask questions that perfectly match the formal language in a book. Before searching, use your LLM to transform the user's input:

- **Query Expansion:** Turn a vague question like _"How to treat a cold?"_ into a list of variations: _"Симптомы простуды," "лечение ОРВИ," "рекомендации при гриппе."_ * **HyDE (Hypothetical Document Embeddings):** Have the LLM write a _fake_ one-paragraph answer to the user's question. Then, use that **fake answer** to search your database. It will be semantically closer to the actual book text than a short question.
    

### 2. Hybrid Retrieval (The 2026 Essential)

Do not rely only on vectors. Vectors are great for "meaning," but bad at "keywords" (like names of drugs, specific laws, or historical dates).

- **Dense Search:** Traditional vector search (using your Cohere or Gemini embeddings).
    
- **Sparse Search (BM25):** Old-school keyword matching.
    
- **Reciprocal Rank Fusion (RRF):** This is the mathematical "merger" that combines both lists. It ensures that if a document has the exact keyword _and_ the right meaning, it jumps to the #1 spot.
    

### 3. Context Expansion (Parent-Document Retrieval)

Since you are using books, a single 1,000-character chunk might be missing the intro or the conclusion of the point.

- **The Trick:** Store **small chunks** for the search (to get high accuracy) but when you find a match, fetch the **entire page** or the **surrounding 3 paragraphs** (the "Parent") to give to the LLM.
    
- This prevents the "lost in the middle" problem where the model has a fact but doesn't understand the context.
    

### 4. The Reranker: Your Quality "Filter"

Initial retrieval is about speed, but it's often "noisy."

- **What to do:** Retrieve 20–30 chunks from your database.
    
- **Apply a Reranker:** Use a model like **Cohere Rerank 3** or **BGE-Reranker-v2-m3**.
    
- A reranker looks at the question and the chunk _together_ and gives a much more accurate score. It will filter out the 15 "sort of relevant" chunks and keep the 5 "perfect" ones.
    

### 5. Citation Generation & Hallucination Guard

To make the system trustworthy, the LLM must prove its work.

- **Metadata Injection:** Pass the page number and book title into the prompt:
    
    > _"Using the context from 'Meditsina.pdf' (Page 45): [Chunk text here]... Answer the question."_
    
- **System Prompt:** Tell the LLM: _"If you cannot find the answer in the provided context, say 'I don't know.' Do not use your own knowledge. Always cite the page number."_
    

---

### Suggested Query Workflow

1. **Input:** User asks a question in Russian.
    
2. **Transform:** LLM rewrites it into a "search-optimized" version.
    
3. **Retrieve:** Search **Qdrant** or **Pinecone** using **Hybrid Search** (Vector + BM25).
    
4. **Filter:** The Reranker picks the top 5 most relevant chunks.
    
5. **Expand:** Fetch the full paragraphs for those 5 chunks from the database.
    
6. **Generate:** LLM writes the final answer with citations (e.g., _[Book A, p.12]_).


# Claude Suggestions

### Layer 1 — Basic dense retrieval (your starting point)

This is what most people implement first. You embed the user's query and find the top-k most similar vectors.

This works but it's the weakest form of retrieval. It fails when the user uses different vocabulary than your book text, when the query is very short, or when the answer requires combining information from multiple chunks.

---

### Layer 2 — Hybrid search (dense + sparse)

This is where you should be for Russian books specifically. Dense search catches semantic meaning; sparse search (BM25-style) catches exact Russian terms, names, titles, and morphological variants. Combined they outperform either alone consistently.

BGE-M3 handles both in a single model, which makes this clean to implement in Qdrant.

Then merge the two result lists using Reciprocal Rank Fusion (explained below).

---

### Layer 3 — Query rewriting and expansion

Users rarely write queries that match your book text perfectly. A short query like "когда была основана Ташкент" may miss chunks that say "город был основан в...". Query expansion solves this.

**Option A — HyDE (Hypothetical Document Embeddings)**

Instead of embedding the query directly, ask an LLM to generate a hypothetical answer, then embed that. The idea is that a hypothetical answer lives in the same semantic space as real book passages.

HyDE works especially well for Russian because the generated passage will naturally use the same morphological forms and vocabulary as your book text.

**Option B — Multi-query retrieval**

Generate multiple phrasings of the same question, search with each, then deduplicate results.

---

### Layer 4 — Reciprocal Rank Fusion (RRF)

When you have results from multiple searches (dense + sparse, or multi-query), you need to merge the ranked lists intelligently. RRF is the standard algorithm — it rewards chunks that appear high in multiple lists.

---

### Layer 5 — Reranking (biggest quality jump after hybrid search)

After retrieving top-k candidates (say 20), you pass them through a cross-encoder reranker that scores each chunk against the query much more precisely than the bi-encoder embedding model could. This is consistently the single biggest quality improvement you can add after basic retrieval.

The reason: bi-encoders (your embedding model) embed query and document independently then compare vectors. Cross-encoders see both query and document together — much richer attention patterns, much more accurate relevance scoring. The trade-off is speed — you can't rerank your entire database, only the top candidates.

For Russian, use `BAAI/bge-reranker-v2-m3` — it's multilingual, works well with Cyrillic, and pairs naturally with BGE-M3.

---

### Layer 6 — Metadata filtering

One of Qdrant's strongest features. You can combine vector search with exact filters so you're only searching within a subset of your corpus. This is crucial for books.
