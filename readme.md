# RAG-Based Assistant
 
## Overview
This project implements a **Retrieval-Augmented Generation (RAG) Assistant** based on the Day 2 hands-on demo.  
The assistant answers user questions by retrieving relevant document content and grounding the LLM response using that context.
 
---
 
## Objective
- Implement a complete RAG architecture  
- Use embeddings and a vector database  
- Retrieve relevant document chunks  
- Generate grounded responses  
- Convert the demo into a working assistant  
 
---
 
## Architecture
 
User Question  
→ Vector Similarity Search  
→ Retrieved Chunks  
→ LLM with Context  
→ Grounded Answer  
 
---
 
## Core Components
 
### 1. Document Ingestion
- Loaded documents using `WebBaseLoader`
- Chunked using `RecursiveCharacterTextSplitter`
 
### 2. Embeddings
- Generated using `OpenAIEmbeddings`
- Converted text chunks into vector representations
 
### 3. Vector Store
- Stored embeddings in `InMemoryVectorStore`
- Enabled semantic similarity search
 
### 4. Query Flow
1. Accept user question  
2. Retrieve top-k relevant chunks  
3. Inject context into prompt  
4. Generate grounded response  
 
The assistant avoids hallucinations by restricting answers to retrieved context.
 
---
 
## How to Run
 
1. Install dependencies:
```bash
pip install langchain langchain-openai langchain-community langchain-core
```

2. Set your OpenAI API key:
 
```python
import os
os.environ["OPENAI_API_KEY"] = "your_api_key"
```
 
3. Start the assistant:
 
```python
chat()
```
 
Type `exit` to quit.

---
 
## Conclusion
 
This implementation demonstrates a complete RAG pipeline including ingestion, embedding, vector storage, semantic retrieval, and grounded LLM generation.
 