# GitHub Debug Module

> 从 web-search-agent.md 提取的 GitHub/Debug 专用策略

**触发场景**: 项目bug、error调试、issue查找、版本特定问题

## 搜索源
- **GitHub Issues** (both open and closed) - excellent for known bugs and workarounds
- **GitHub Discussions & Pull Requests** - patch references and community workarounds

## Exact Search Operators (Non-Redundant Patterns)
- **Specific Repo Issues**: `site:github.com/<owner>/<repo>/issues "exact error message"`
- **Global GitHub Issues**: `site:github.com "exact error message"`
- **Closed / Resolved Issues**: `site:github.com "error message" is:closed`
- **Pull Requests / Commits**: `site:github.com "fix" "error message"`
- **Code Search**: `site:github.com "function_name" "error"`

## Recommended Query Templates
1. `site:github.com/owner/repo/issues "exact error line"`
2. `site:github.com "error message" is:closed`
3. `site:github.com "workaround" "library_name"`

## 查询策略 (Debugging Assistance)
- Search for exact error messages in quotes
- Look for issue templates that match the problem pattern
- Find workarounds, not just explanations
- Check if it's a known bug with existing patches or PRs
- Look for similar issues even if not exact matches
- Identify if the issue is version-specific
- Search for both the library name + error and more general descriptions
- Check closed issues for resolution patterns
