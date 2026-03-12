# Code Review: Option 2 — LangChain RAG + Web Search Agent
**Reviewer:** Claude
**Date:** 2026-03-12
**File:** `2_LangChain_RAG_+_Web_Search_Agent.ipynb`

---

## Overall Assessment

Farheen has built a working RAG pipeline that covers all the core components: document loading, chunking, embedding, vector storage, retrieval, and grounded generation. The code is clean, readable, and the chat loop works end-to-end as demonstrated by the notebook output. That said, there are a few bugs, a missing feature implied by the title, and some areas worth improving.

---

## What Was Done Well

- **Complete RAG pipeline** — all stages (ingest → embed → store → retrieve → generate) are present and connected correctly.
- **Custom prompt template** — the `PromptTemplate` does a good job instructing the model to stay grounded and only say "I don't have enough information" when the context is truly unrelated. This reduces hallucinations.
- **Retriever configuration** — using `search_type="similarity"` with `k=5` is a reasonable default.
- **Source attribution** — displaying source URLs after each answer is great practice for transparency.
- **Empty context guard** — checking `if not context.strip()` before calling the LLM avoids a pointless (and paid) API call on empty retrievals.
- **ChromaDB alternative shown** — the commented-out Chroma block is a nice touch showing awareness of persistent vector stores.
- **Clean chat loop** — the `chat()` function is simple and user-friendly with the `exit` keyword.

---

## Bugs

### 1. Return Type Inconsistency — Will Crash at Runtime (Critical)

**Location:** `rag_assistant()` and `chat()`

In `rag_assistant`, the happy path returns a **tuple**:
```python
return response.content, docs
```
But the early-exit path returns a **bare string**:
```python
return "No relevant documents found."
```

In `chat()`, the result is always unpacked as a tuple:
```python
answer, sources = rag_assistant(question)
```

If `context` is empty and `rag_assistant` returns the string, this line will throw a `ValueError: too many values to unpack` (or a similar unpacking error). The empty-context path has never been triggered in the demo, so it went unnoticed — but it is a latent bug.

**Fix:**
```python
# Option A: always return a tuple
return "No relevant documents found.", []

# Option B: handle in chat()
result = rag_assistant(question)
if isinstance(result, tuple):
    answer, sources = result
else:
    answer, sources = result, []
```

---

## Missing Feature

### 2. Web Search Is Not Implemented

The notebook is titled **"RAG + Web Search Agent"** and the repository README also references this, but there is no web search functionality anywhere in the code. If the assignment intended a fallback to web search when the vector store doesn't have relevant context, or a tool-calling agent that can optionally search the web, this is a significant gap.

A typical implementation would use something like:
- `TavilySearchResults` or `DuckDuckGoSearchRun` from `langchain_community.tools`
- A LangChain agent (`create_tool_calling_agent` / `AgentExecutor`) that decides whether to use RAG retrieval or web search

If web search was not required for Option 2, the title should be updated to avoid confusion.

---

## Minor Issues

### 3. Typo in Markdown Header

```
### Embeedings Model   ← should be "Embeddings Model"
```

### 4. Redundant Source Display

In the demo output, all 5 retrieved chunks come from the **same URL**:
```
1. https://lilianweng.github.io/posts/2023-06-23-agent/
2. https://lilianweng.github.io/posts/2023-06-23-agent/
...
```
This is expected (only one document was loaded), but when multiple sources are used the output would contain duplicates. Deduplicating the URLs before displaying would make this more useful:

```python
unique_sources = list(dict.fromkeys(
    doc.metadata.get('source', 'Unknown') for doc in sources
))
for i, src in enumerate(unique_sources, 1):
    print(f"{i}. {src}")
```

### 5. Model Cost Consideration

Using `gpt-4o` + `text-embedding-3-large` is the most expensive combination available. For a learning/demo project with a single small document this is fine, but it's worth noting:
- `gpt-4o-mini` would produce very similar results here at a fraction of the cost.
- `text-embedding-3-small` is sufficient for most RAG demos.

This isn't a bug, just a practical heads-up.

### 6. Single Hardcoded Data Source

The loader is hardcoded to one URL. Extending this to accept a list of URLs or a local directory of files would make the assistant far more useful. The `WebBaseLoader` already accepts multiple `web_paths`, so this is a small change.

---

## Summary Table

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Critical** | `rag_assistant` returns inconsistent types — will crash if context is empty |
| 2 | **High** | Web search not implemented despite being in the title |
| 3 | Low | Typo: "Embeedings" |
| 4 | Low | Duplicate source URLs in output |
| 5 | Low | Expensive model choices for a demo |
| 6 | Low | Single hardcoded data source |

---

## Recommended Next Steps

1. **Fix the return-type bug** (critical, 2-line fix).
2. **Clarify or implement web search** — either rename the notebook to "RAG Assistant" or add a web search tool/agent fallback.
3. Deduplicate the sources display.
4. Optionally swap to `gpt-4o-mini` + `text-embedding-3-small` to keep costs low during development.
