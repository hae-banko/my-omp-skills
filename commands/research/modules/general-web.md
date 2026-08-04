# General Web Module

> 从 web-search-agent.md 提取的通用网页搜索策略

**触发场景**: 通用信息、新闻、产品对比、最佳实践

## 搜索源
- **Reddit** (r/programming, r/webdev, r/javascript, and topic-specific subreddits) - real-world experiences
- **Official documentation** and changelogs - authoritative information
- **Blog posts** and tutorials - detailed explanations
- **Hacker News** discussions - high-quality technical discourse
- **Dev.to** (dev.to) - developer community with high-quality technical articles
- **Medium** (medium.com) - technical blog platform with in-depth articles
- **Discord** - official discussion channels for open source projects
- **X/Twitter** - technical announcements and discussions

## Exact Search Operators (Non-Redundant Patterns)
- **Reddit**: `site:reddit.com/r/programming "topic"` | `site:reddit.com "topic"`
- **Hacker News**: `site:news.ycombinator.com "topic"`
- **Dev.to / Medium**: `site:dev.to "topic"` | `site:medium.com "topic"`
- **X / Twitter**: `site:x.com "announcement"` | `site:twitter.com "announcement"`
- **Official Docs**: `site:<domain>/docs "API / feature"`

## Recommended Query Templates
1. `site:reddit.com/r/webdev "topic comparison"`
2. `site:news.ycombinator.com "project name"`
3. `site:dev.to "best practices" "technology"`

## 查询策略 (Best Practices & Comparative Research)
- Look for official recommendations first
- Cross-reference with community consensus
- Find examples from production codebases
- Identify anti-patterns and common pitfalls
- Note evolving best practices and deprecated approaches
- Create structured comparisons with clear criteria
- Find real-world usage examples and case studies
- Look for performance benchmarks and user experiences
