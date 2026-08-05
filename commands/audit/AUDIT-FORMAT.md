# Audit Report Format

Every formal audit report produced by `/audit` lives in `.omp/audits/<slug>/report.md` (with optional archived historical snapshots in `.omp/audits/<slug>/archive/vX.Y.Z.md`) and adheres strictly to this format.

## YAML Frontmatter

```yaml
---
title: "<Descriptive Title of the Audit>"
slug: "<kebab-case-slug>"
version: "v0.1.0"
status: active # active | superseded | archived
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
---
```

### Frontmatter Fields

- **`title`**: Single line descriptive title of what was audited.
- **`slug`**: Kebab-case identifier matching the directory name under `.omp/audits/<slug>/`.
- **`version`**: Semantic Versioning string prefixed with `v` (e.g. `v0.1.0`, `v0.2.0`, `v1.0.0`).
- **`status`**: Lifecycle state of the audit (`active`, `superseded`, or `archived`).
- **`created`**: Date the audit report was first created (`YYYY-MM-DD`).
- **`updated`**: Date of the most recent revision (`YYYY-MM-DD`).
- **`tags`**: List of relevant topics, subsystems, or component keywords.

## Required Report Sections

Every audit report MUST contain all seven required sections in order:

1. `## Executive Summary`
   High-level summary of findings, key verdicts, critical vulnerabilities or design flaws, and overall health assessment.

2. `## Scope & Subject`
   Defines the exact boundaries of what was examined (files, modules, architectural concepts, pull requests, proposals) and explicit non-goals or out-of-scope areas.

3. `## Critical Evaluation & Methodology`
   The investigative techniques, tools, code paths traced, hypotheses tested, and evaluation criteria applied. Emphasizes an independent, critical, non-validating stance.

4. `## Detailed Findings`
   In-depth technical breakdown of discoveries, categorized by severity or subsystem, with code snippets, line references, or structural evidence.

5. `## Risks & Limitations`
   Identified operational, security, structural, or maintenance risks, as well as limitations of the audit itself (e.g., unverified runtime edge cases, missing test fixtures).

6. `## Conclusion & Recommendations`
   Actionable next steps, prioritized remediation roadmap, architectural design changes, or follow-up work items.

7. `## Revision History`
   A log of audit versions and changes across revisions.

```markdown
### Revision History

- **v0.1.0** (YYYY-MM-DD): Initial audit report covering <scope>.
```
