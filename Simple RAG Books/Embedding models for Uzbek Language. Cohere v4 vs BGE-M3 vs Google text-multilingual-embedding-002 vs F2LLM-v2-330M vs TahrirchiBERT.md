# Best embedding model for Uzbek Language 

1. F2LLM-v2
2. BGE-M3


# Gemini Suggestions

### 1. The Heavy Hitters (Recommended for Production)

- **Cohere Embed v4 (Multilingual):**
    - **Role:** The **top-tier choice** for RAG.
    - **Why:** It excels at semantic alignment across languages. If you want to ask a question in Russian and find a matching document in Uzbek, this model’s "shared vector space" is currently the best in the industry. It treats Uzbek with high priority due to its focus on multilingual commercial utility.
- **Google `text-multilingual-embedding-002`:**
    - **Role:** The **most reliable "all-rounder."**
    - **Why:** Because it is deeply integrated with Google’s global data infrastructure, it has an incredibly modern understanding of how Uzbek (Latin) is used in contemporary web content. It is extremely stable and works seamlessly with Gemini-based LLM pipelines.

### 2. The Specialized & Open-Source Options

- **BGE-M3 (BAAI):**
    - **Role:** The **"Hybrid Powerhouse."**
    - **Why:** This is unique because it supports **dense, sparse, and multi-vector retrieval** simultaneously. If you have "keyword-heavy" documents (where specific technical terms are more important than general meaning), BGE-M3 will outperform Cohere and Google. It is the best choice if you want to run your own infrastructure (hosting it yourself on a GPU).
- **F2LLM-v2 (e.g., 330M):**
    - **Role:** The **"Emerging Specialist."**
    - **Why:** This model is specifically marketed as being built for "previously underserved low-resource languages." It uses a two-stage training pipeline. While it may not have the brand name of Cohere, its design is mathematically optimized to handle the agglutinative nature of Uzbek better than models that just "happen to include" the language.

### 3. The "Legacy" Specialized Option

- **TahrirchiBERT:**
    - **Role:** **Research & Classification.**
    - **Why:** This is a BERT-based model specifically pretrained on Uzbek.
    - **Warning:** **Do not use this for RAG.** It is an older architecture designed for text classification or named entity recognition, not for generating the long-form semantic embeddings needed for modern RAG. It lacks the modern "multilingual alignment" that Cohere or Google models possess.

# Claude Suggestions

**F2LLM-v2-330M** is the most exciting find for your use case. It's a new family of multilingual embedding models supporting more than 200 languages, with a particular emphasis on previously underserved mid- and low-resource languages. [arXiv](https://arxiv.org/abs/2603.19223) Crucially, the 14B variant ranks first on 11 MTEB benchmarks, and the smaller models also set new state-of-the-art for resource-constrained applications. [arXiv](https://arxiv.org/html/2603.19223) The 330M version is free, runs locally, supports Matryoshka embeddings (so you can tune dimensions), and is fully open including training data and code — released just in March 2026. This is your best drop-in option for Uzbek right now.

**BGE-M3** is the strongest existing open-source multilingual model. It was trained on datasets covering up to 170+ languages and supports dense retrieval, lexical matching, and multi-vector interaction in a single model. [Bge-model](https://bge-model.com/bge/bge_m3.html) Its unique advantage is the ability to simultaneously generate multiple representations — dense, sparse, and ColBERT — which can enhance accuracy and generalization unlike most models that only do dense retrieval. [Hugging Face](https://huggingface.co/dabitbol/bge-m3-sparse-elastic) For Uzbek it's a solid fallback, especially if you want hybrid search.

**Cohere Embed v4** leads on multilingual retrieval benchmarks and supports 100+ languages in a unified embedding space. [Getathenic](https://getathenic.com/blog/cohere-embed-v4-multilingual-embeddings) However, Uzbek is not among its explicitly listed or evaluated languages — the docs highlight Arabic, Chinese, French, Korean etc. It's cloud-only and paid, which adds ongoing cost and means your book data leaves your infrastructure.

**Google text-multilingual-embedding-002** has a critical distinction to understand: Uzbek is listed as a "supported" language, but the evaluated languages — where Google actually tested quality — are only Arabic, Bengali, English, Spanish, German, Persian, Finnish, French, Hindi, Indonesian, Japanese, Korean, Russian, Swahili, Telugu, Thai, Yoruba, and Chinese. [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api) Uzbek is in the supported list but not the evaluated list. That's a meaningful gap — it means Google makes no quality claim for Uzbek. Avoid it for this use case.

**TahrirchiBERT** has the highest Uzbek language fit of any model — it was pretrained specifically on Uzbek Latin script using 5 billion tokens of Uzbek books and web text, with a vocabulary of 30,528 designed to handle rare Uzbek words. [Hugging Face](https://huggingface.co/tahrirchi/tahrirchi-bert-base) The catch: it's a masked language model, not a sentence embedding model. You'd need to fine-tune it for semantic similarity before using it in RAG. Once fine-tuned though, it will outperform everything else on Uzbek because it understands Uzbek morphology at a level no multilingual model can match.


# Deepseek Suggestions

### 1. F2LLM-v2: Best for Document Embedding (Your Use Case)

According to the official paper released in March 2026, F2LLM-v2 is a family of multilingual embedding models available in **8 sizes from 80M to 14B parameters**[](https://arxiv.org/html/2603.19223v1)[](https://www.opentrain.ai/tools/hf-eval-papers/paper/0ffd29aa-ee32-4e0c-a92d-4c5372b5e748/).

**Key advantages:**

- Trained on **60 million samples across 282 natural languages**
- Specific emphasis on "**previously underserved mid- and low-resource languages**" like Uzbek[](https://arxiv.org/html/2603.19223v1)
- Supports Matryoshka Representation Learning (MRL) for storage efficiency
- Apache 2.0 licensed - fully open source

**For your 300 books (Russian + Uzbek)**: F2LLM-v2-330M is the ideal balance of quality and efficiency.

---

### 2. AugSBERT-Uz: Best for Semantic Similarity

A research paper published in November 2025 introduced **AugSBERT-Uz**, a semi-supervised model specifically designed for Uzbek sentence embeddings[](https://zenodo.org/records/17693973).

**Key specifications:**

|Metric|Value|
|---|---|
|Performance|83.2 Spearman correlation on Uzbek STS tasks|
|Inference time|5 seconds|
|Architecture|Teacher-student knowledge distillation|
|Underlying model|BERTbek (monolingual Uzbek BERT)|

**Why this matters**: This is the **first publicly available high-performance sentence embedding model for Uzbek**. It bridges the performance gap caused by data scarcity for this agglutinative, low-resource language[](https://zenodo.org/records/17693973).

**Use case**: If your primary need is comparing similarity between two Uzbek sentences (e.g., duplicate detection), this is your best choice.

---

### 3. Llama-3.1-8B-Instruct-Uz: Best for Generation & Understanding

Developed by Eldor Fozilov, Azimjon Urinov, and Khurshid Juraev, this is an **8B parameter instruction-tuned model** fine-tuned on Uzbek and English data[](https://featherless.ai/models/behbudiy/Llama-3.1-8B-Instuct-Uz).

**Benchmark results (on UzLiB - Uzbek Linguistic Benchmark):**

- Significantly outperforms base Llama-3.1 8B Instruct on Uzbek tasks
- Outperforms Mistral 7B models on Uzbek-English translation (BLEU/COMET)
- Strong on Uzbek sentiment analysis and news classification
- Maintains strong English MMLU (62.78)

**Use case**: If you need to generate responses in Uzbek (beyond just retrieval), fine-tune this model for your RAG system.

---

### 4. BERTbek: Foundational Uzbek Monolingual Model

Presented at LREC-COLING 2024, BERTbek is one of the first monolingual transformer models for Uzbek[](https://khorezmscience.uz/actual-problems-in-modern-technical-sciences/2059-transformer-based-nlp-solutions-for-the-uzbek-language.html)[](https://aclanthology.org/2024.sigul-1.5/).

**Key findings from the paper:**

- Outperforms **multilingual BERT (mBERT)** on three tasks: sentiment analysis, multi-label topic classification, and named entity recognition
- Three variants available: BERTbek-Wiki, BERTbek-News-Small, BERTbek-News-Big
- BERTbek-News-Big performs best across all benchmarks[](https://aclanthology.org/2024.sigul-1.5/)

**Use case**: Downstream NLP tasks like classification, NER, or sentiment analysis for Uzbek text.

---

### 5. F1LLM-v2: Mentions Uzbek Language Support

F1LLM-v2 explicitly includes Uzbek (uzb) in its coverage of over 200 languages[](https://arxiv.org/html/2603.19223v1). The model is designed for both natural language and code understanding, with emphasis on underserved, low-resource languages.