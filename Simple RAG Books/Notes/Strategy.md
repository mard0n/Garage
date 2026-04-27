
# 1. Chunking

> Which chunking libraries should I use? from PDF to Text??? What if page number matters?

### The PDF Extraction "Pre-processor"
Mistral OCR
PyMuPDF

### The Specific Chunking Plan
Since you are dealing with books, **Recursive Character Splitting** is your best balance of speed and logic. However, for high accuracy, you should implement **Document-Structure-Based Chunking**.

#### Option A (Best Overall): Recursive Chunking

Use:
- LangChain `RecursiveCharacterTextSplitter`
**Why it works:**
- Tries splitting by:
    1. paragraphs
    2. sentences
    3. words
So chunks stay _natural_.

**Example config:**
```python
chunk_size = 500      # tokens or ~characters proxy  
chunk_overlap = 100
```
For Russian text, this works well out of the box.

#### The Implementation Logic
1. **Extract by Page:** Extract text into a list of objects: `{"page": 1, "text": "..."}`.
2. **Hybrid Chunking:** Use a `RecursiveCharacterTextSplitter` (available in LangChain or LlamaIndex).
    - **Separators:** `["\n\n", "\n", ".", " ", ""]` (This prioritizes splitting at paragraphs first, then sentences).
    - **Chunk Size:** 800–1000 characters.
    - **Overlap:** 100–150 characters (Crucial for Russian, as sentences can be long and complex).

#### Option B — Semantic Chunking (best quality)

Splits based on meaning shifts, not character count.

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_community.embeddings import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-large")

chunker = SemanticChunker(
    embeddings,
    breakpoint_threshold_type="percentile",  # splits where meaning shifts most
    breakpoint_threshold_amount=90
)

chunks = chunker.create_documents([full_chapter_text])
```

Good for: academic books, long narrative chapters.

#### Handling Page Boundaries (Subtle but Important)
Don’t blindly chunk across pages without tracking.

**Best approach:**
- Extract **per page**
- Then allow chunking to **merge across pages**, but:

Keep metadata like:
```json
{  
  "text": "...",  
  "page_start": 10,  
  "page_end": 11  
}
```

👉 This avoids:
- broken ideas at page edges
- losing citation accuracy

### Recommended Pipeline (OpenAI)
#### Step-by-step:
1. Extract with PyMuPDF:
    - keep page number
2. Clean text:
    - remove headers/footers
    - fix line breaks
3. Merge pages into a continuous stream
4. Chunk using:
    - RecursiveCharacterTextSplitter (start here)
5. Attach metadata:
    - `page_start`, `page_end`, `source`
6. Store in vector DB

#### My Specific Recommendation for You

Given Russian-only books as PDFs, here's the exact stack:

```
PDF → pymupdf4llm → chonkie (SemanticChunker) → store with page metadata → Qdrant
```

1. **Extraction:** `pymupdf4llm` — best Cyrillic handling, outputs Markdown
2. **Chunking:** `chonkie` with `multilingual-e5-large` — semantic, fast, no token count guessing
3. **Chunk size:** 400–600 tokens (~1000–1500 chars in Russian)
4. **Overlap:** 50–80 tokens between chunks
5. **Metadata per chunk:** `page`, `book_title`, `chapter`, `language: "ru"`, `chunk_id`
6. **Page handling:** chunk per-page first, then split — page number is always preserved

# 2. Embed & store

> Which embedding model should I use? (OpenAI, Gemini)
> Which VectorDB should I use? (Qdrant)
> Should I train locally (FAISS, chroma) or use services (pinecone) or frameworks (llamaindex, langchain)

## The Embedding Model

2 language dilemma (Uzbek and Russian)

### Option 1 — Same model, separate collection (simplest)

Just use `multilingual-e5-large` for both languages but store them in separate Qdrant collections. Query routing decides which collection to search.
Pros: zero extra work, one model to manage. Cons: Uzbek quality is mediocre.

**Why Uzbek quality will be lower?**
When you "feed books to the embedder," you are **not training the model**. You are just converting text to vectors using a model that was already trained months ago by researchers. Your books never change the model's weights at all.

The quality of embeddings depends entirely on what the model learned during its original pre-training. And here is the problem:

`multilingual-e5-large` was trained on internet-scale data across 100 languages. That training data looks roughly like this:

|Language|Approximate data share|
|---|---|
|English|~40%|
|Russian|~8%|
|German, French, Chinese...|~3–5% each|
|Uzbek Latin|~0.1% or less|

[[Embedding models for Uzbek Language. Cohere v4 vs BGE-M3 vs Google text-multilingual-embedding-002 vs F2LLM-v2-330M vs TahrirchiBERT]]

[[Embedding models for Russian Language.  BGE-M3 vs Cohere Embed v4 vs OpenAI text-embedding-3-large vs multilingual-e5-large-instruct vs Google Gemini Embedding 2 vs GigaEmbeddings]]

### Option 2 – Hybrid Language Strategy (Very Effective)

Even if your data is Uzbek, you can:

### Approach:

1. Translate query → Russian or English
2. Retrieve chunks
3. Answer in Uzbek

Use:

- Google Translate or LLM

👉 Why this works:

- Russian embeddings are stronger
- Uzbek queries get mapped into better semantic space

### Option 3 – The Unified "Multilingual" Index

Put all Russian and Uzbek chunks into **one** Vector Database.

- **How:** Use a single multilingual model (like Cohere v4) for everything.
- **Pros:** You can perform **Cross-Lingual Search**. A user can ask in Russian, and the system will retrieve the most relevant page even if it's in Uzbek.
- **Requirement:** You must add a `language` tag to your metadata (`{"lang": "uz", "page": 12}`).


## Vector Database

**LanceDB** is an embedded vector database — it runs inside your application process with no server required, similar to SQLite for relational data. It stores data as columnar files on disk (Lance format), supports filtering, and has good Python integration. For a small-scale project where you want zero infrastructure overhead it's an interesting option. Less mature than Qdrant but actively developed.

**FAISS** (Facebook AI Similarity Search) is a library rather than a database — it gives you extremely fast approximate nearest neighbor search but you have to build everything else yourself: persistence, metadata storage, filtering, APIs. It's what many vector databases use internally. Using FAISS directly means writing significant boilerplate code and managing your own metadata in a separate store. Not recommended unless you have very specific performance requirements that nothing else meets.

**Qdrant** is what we've been recommending throughout this conversation and the reasoning still holds. It's written in Rust which means it's extremely fast and memory-efficient, it runs in Docker with a single command, and it has the richest filtering system of any vector database — you can filter by book title, page number, language, or any metadata field at query time without rebuilding the index. It supports dense, sparse, and hybrid search natively. For your 300 books it's genuinely trivial to run on a modest machine. The community is active and documentation is excellent. This remains your best default choice.

**Chroma** is the simplest possible vector database to get started with — you can have it running in Python in literally five lines of code with no Docker required. The trade-off is that it's less mature for production use, has fewer filtering capabilities than Qdrant, and performance degrades more noticeably at larger scales. For prototyping and testing your chunking and embedding pipeline before committing to Qdrant, Chroma is excellent.

**Pinecone** was the first purpose-built managed vector database and is still the most popular cloud option. Zero infrastructure, scales automatically, good Python SDK. The trade-off is that it's the most expensive option at scale, your data lives in their cloud, and you have less control over indexing and filtering compared to Qdrant. For 300 books the free tier may cover you initially, but production usage gets expensive. Also no self-hosting option exists.

**Weaviate Cloud**, **Qdrant Cloud**, and **Chroma Cloud** are all managed tiers of the self-hosted options above. A sensible migration path is to start self-hosted, then move to the managed tier of whichever database you chose if infrastructure becomes a burden.

### Choice: Qdrant

# 3. Query

[[Different query optimization strategies suggested by LLMs]]


