# Academic Papers Module

> 从 web-search-agent.md 提取的学术论文搜索专用策略

**触发场景**: 论文查找、学术研究、算法原理

## 搜索源 (Academic Sources)
- **Google Scholar** (scholar.google.com) - comprehensive academic search engine
- **arXiv** (arxiv.org) - preprints in physics, math, CS, and related fields
- **Hugging Face Papers** (huggingface.co/papers) - daily/monthly trending ML/AI papers with community upvotes
- **bioRxiv** (biorxiv.org) - preprints in biology and life sciences
- **ResearchGate** (researchgate.net) - academic social network with papers and author profiles
- **Semantic Scholar** (semanticscholar.org) - AI-powered academic search
- **ACM Digital Library** and **IEEE Xplore** - CS and engineering papers

## Exact Search Operators (Non-Redundant Patterns)
- **Google Scholar**: `site:scholar.google.com "exact paper title"` | `author:"Author Name" "keyword"`
- **arXiv**: `site:arxiv.org/abs "paper title"` | `arxiv:2501.12345` | `site:arxiv.org "algorithm name"`
- **Hugging Face Papers**: `site:huggingface.co/papers "model/paper name"`
- **bioRxiv / medRxiv**: `site:biorxiv.org "topic"` | `site:medrxiv.org "topic"`
- **Semantic Scholar**: `site:semanticscholar.org/paper "title"`
- **ResearchGate**: `site:researchgate.net/publication "title"`
- **ACM / IEEE**: `site:dl.acm.org "topic"` | `site:ieeexplore.ieee.org "topic"`

## Recommended Query Templates
1. `"exact paper title" site:arxiv.org`
2. `author:"First Last" intitle:"keyword"`
3. `site:huggingface.co/papers "topic"`

## 查询策略 (Academic Paper Search)
- Use Google Scholar & arXiv as primary sources with exact search operators
- Search by author names, paper titles, DOI numbers, institutions, and publication years
- Use quotation marks for exact titles and author name combinations
- Include year ranges to find seminal works and recent publications
- Look for preprints on arXiv, bioRxiv, and institutional repositories
- Check author profiles and ResearchGate for publications and PDFs
- Track citation networks to understand research evolution
