#!/usr/bin/env python3
"""Generate report.md + summary.md from deep-research JSON results.

Single-pass over results/*.json; reads fields.yaml for the field structure;
writes {project_dir}/report.md (full report) and {project_dir}/summary.md
(accessible digest: same header stats + executive summary, an Action Plan
with a one-line Problem column, and a Notes footer).

Report structure (v2, summary-first + detail-preserving):
1. Header stats — items, field coverage, unresolved, distinct sources.
2. Executive Summary — coverage paragraph (waves, strategy modules),
   priority / severity / effort mix, top findings (P0 + P1, one line each),
   most-affected surfaces histogram.
3. Shared context — repo anchor facts (source symbols, issue numbers,
   conventions) repeated across many items, surfaced once instead of per
   item; patterns live in SHARED_CONTEXT_PATTERNS (extensible) and only
   anchors mentioned in >= 2 items render.
4. Action Plan — table of every item sorted by priority then severity, so the
   report opens with "what to fix first".
5. Table of Contents — every item with anchor link + short badges; no
   truncation (the Action Plan carries the summary fields).
6. Findings — per item: a meta line (severity / priority / effort / affected
   component) and the one-line summary stay visible; short body fields stay
   visible; long fields (>COLLAPSE_THRESHOLD chars) collapse into <details>
   blocks so the page stays scannable without losing detail; per-item source
   links.
7. Sources — deduped appendix, each URL annotated with the items it grounds.
8. Unresolved Fields & Attempts — provenance for items with uncertain/empty
   fields, rendered from the internal _attempts bookkeeping.

Generic across field schemas: categories and fields come from fields.yaml;
summary fields (severity/priority/effort/affected_component) and the one-line
summary are detected, and absent ones degrade to '—'.
"""
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml required: pip install pyyaml")

# Canonical script: run from the package path with the project dir as argv[1]
# (python commands/research-report/generate_report.py <project_dir>). A
# project-local copy (script parent dir) still works for backward compat.
PROJECT_DIR = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
RESULTS_DIR = PROJECT_DIR / "results"
FIELDS_PATH = PROJECT_DIR / "fields.yaml"
OUTLINE_PATH = PROJECT_DIR / "outline.yaml"
RESEARCH_MD_PATH = PROJECT_DIR / "research.md"
OUTPUT_PATH = PROJECT_DIR / "report.md"
SUMMARY_OUTPUT_PATH = PROJECT_DIR / "summary.md"

# Canonical category -> [alt keys]. Lookup dict is inverted below for O(1) access.
CATEGORY_MAPPING = {
    "Problem": ["problem", "Problem", "basic_info", "Basic Info"],
    "Solution": ["solution", "Solution", "technical_features", "Technical Features"],
    "Context": ["context", "Context", "performance_metrics", "Performance Metrics"],
}
CATEGORY_LOOKUP = {alt.lower(): canonical for canonical, alts in CATEGORY_MAPPING.items() for alt in alts}

# Fields rendered in the per-item meta line instead of the body.
SUMMARY_FIELDS = ["severity", "priority", "effort", "affected_component"]
SUMMARY_ONELINER = "ux_issue"          # brief "one-line problem" field, if present
COLLAPSE_THRESHOLD = 160               # body fields longer than this collapse into <details>
TOC_BADGES = ["priority", "effort"]    # short fields shown next to TOC entries

# Repo anchor facts that recur across many items (the same source-code symbol,
# upstream issue, or convention cited over and over). The report surfaces each
# once in a "Shared context" front-matter section instead of the reader
# meeting it 21 times. Each entry is (label, regex); the regex is searched
# case-insensitively over every item's field values, and only anchors
# mentioned in >= 2 items render, sorted most-repeated first. Extend this
# list per project — projects that mention none of the anchors simply get no
# Shared context section.
SHARED_CONTEXT_PATTERNS = [
    ("NO_COLOR gating", r"\bNO_COLOR\b"),
    ("pi.sendMessage payloads", r"pi\.sendMessage"),
    ("extractPayload helper", r"extractPayload"),
    ("BOX_WIDTH=76 fixed-width constants", r"BOX_WIDTH"),
    ("installResearch*Renderer registration (src/index.ts)", r"installResearch"),
    ("Kiro #7471 (scrollback issues)", r"Kiro #7471"),
    ("AG-UI lifecycle events", r"AG-UI"),
    ("WCAG 4.5:1 contrast minimum", r"4\.5:1"),
    ("truncateToWidth / visibleWidth width utilities", r"truncateToWidth"),
    ("research.md front-matter status", r"research\.md front-matter"),
    ("getResearchDashboardMetrics derivation", r"getResearchDashboardMetrics"),
    ("fabricated \u0394U \u22120.15 uncertainty metric", r"\u0394U"),
]

ACRONYMS = {"omp": "OMP", "ux": "UX", "api": "API", "ag": "AG", "ui": "UI", "toc": "TOC",
            "eta": "ETA", "cjk": "CJK", "wcag": "WCAG", "os": "OS", "tty": "TTY"}

SKIP_TOP_LEVEL = {"name", "uncertain"}  # never rendered as body fields

PRIORITY_RANK = {"p0": 0, "p1": 1, "p2": 2, "p3": 3}
SEVERITY_RANK = {"blocker": 0, "major": 1, "minor": 2, "cosmetic": 3}
TLD_SUFFIX = r"\.(?:com|org|net|io|dev|ai|edu|gov|co|cn|me|app|info|biz|wiki)\b"
URL_RE = re.compile(r"https?://[^\s)\]>\"']+|(?:[\w-]+\.)+(?:com|org|net|io|dev|ai|edu|gov|co|cn|me|app|info|biz|wiki)(?:/[^\s)\]>\"']*)?", re.I)
GITHUB_REPO_RE = re.compile(r"https?://(?:www\.)?github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)", re.I)
UNCERTAIN_MARKER = "[uncertain]"


def extract_github_repos(items: list) -> list:
    counts = {}
    for it in items:
        text = it["text"]
        for match in GITHUB_REPO_RE.finditer(text):
            owner = match.group(1)
            repo = match.group(2).rstrip(".,;:!?)]}>\"'")
            if repo.endswith(".git"):
                repo = repo[:-4]
            if owner.lower() in ("features", "topics", "collections", "trending", "events", "sponsor", "pricing", "orgs", "settings", "notifications"):
                continue
            if repo.lower() in ("settings", "issues", "pulls", "actions", "wiki", "discussions", "releases", "commit", "commits", "blob", "tree", "raw", "stargazers", "watchers"):
                continue
            slug = f"{owner}/{repo}"
            counts[slug] = counts.get(slug, 0) + 1
    sorted_repos = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    return [{"name": slug, "url": f"https://github.com/{slug}", "count": count} for slug, count in sorted_repos]


def discovered_references_lines(repos: list) -> list:
    if not repos:
        return []
    lines = [
        "## Discovered Reference Repositories",
        "",
        "The following GitHub repositories were cited in the research findings and are candidates for local reference absorption:",
        "",
    ]
    for r in repos[:10]:
        c_str = f"cited in {r['count']} item{'s' if r['count'] != 1 else ''}"
        lines.append(f"- **[{r['name']}]({r['url']})** ({c_str}) — `/reference add {r['url']}`")
    return lines

def display_name(field: str) -> str:
    parts = field.split("_")
    return " ".join(ACRONYMS.get(p, p.capitalize()) for p in parts)


def slugify(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)          # drop punctuation (em dashes, &, /)
    s = re.sub(r"\s+", "-", s.strip())
    return s


def lookup(data: dict, field: str):
    """Field lookup: top level -> category sub-dict -> any nested dict. First hit wins."""
    if field in data:
        return data[field]
    for key, val in data.items():
        if isinstance(val, dict):
            if field in val:
                return val[field]
            for sub in val.values():
                if isinstance(sub, dict) and field in sub:
                    return sub[field]
    return None


def fmt_value(value) -> str:
    if isinstance(value, dict):
        return "; ".join(f"{k}: {fmt_value(v)}" for k, v in value.items())
    if isinstance(value, list):
        if not value:
            return ""
        if all(isinstance(v, dict) for v in value):          # list of dicts: one line per dict
            return "\n".join(" | ".join(f"{k}: {fmt_value(x)}" for k, x in v.items()) for v in value)
        if len(value) <= 4 and all(len(str(v)) <= 60 for v in value):   # short list
            return ", ".join(str(v) for v in value)
        return "\n".join(f"- {v}" for v in value)            # long list: line breaks
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def is_uncertain_value(value) -> bool:
    """True only when the field value IS the marker (optionally with trailing prose),
    not when prose merely quotes the convention."""
    if not isinstance(value, str):
        return False
    s = value.strip()
    return s == UNCERTAIN_MARKER or s.startswith(UNCERTAIN_MARKER + " ") or s.startswith(UNCERTAIN_MARKER + "\n")


def render_field(label: str, value) -> str:
    text = fmt_value(value)
    if not text:
        return ""
    if len(text) > COLLAPSE_THRESHOLD:                        # long text: blockquote + <br>
        body = "<br>".join(line for line in text.split("\n"))
        return f"**{label}**\n\n> {body}"
    return f"**{label}** — {text}"


def extract_urls(text) -> list:
    """Scheme URLs plus bare domains (w3.org/TR/WCAG22); file paths like
    src/foo.ts or README.md are excluded via the TLD whitelist and a
    lookbehind that rejects matches glued to path characters. A match that
    stops mid-word (CustomMessagePayload.co in ".content") is rejected."""
    out = []
    for m in URL_RE.finditer(str(text)):
        s = m.start()
        e = m.end()
        if s > 0 and (text[s - 1].isalnum() or text[s - 1] in "./-"):
            continue
        if e < len(text) and text[e].isalnum():
            continue                                  # TLD truncated mid-word
        url = m.group(0).rstrip(".,;:!?)]}>\"'")
        if url:
            out.append(url)
    return list(dict.fromkeys(out))                           # dedupe, keep order


def source_label(url: str) -> str:
    label = re.sub(r"^https?://(www\.)?", "", url)
    return label if len(label) <= 46 else label[:43] + "…"


def source_href(url: str) -> str:
    return url if url.startswith(("http://", "https://")) else "https://" + url


def load_fields(path: Path):
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    categories = doc.get("categories", {}) or {}
    field_order = []
    known = set()
    for cat, fields in categories.items():
        canonical = CATEGORY_LOOKUP.get(cat.lower(), cat.capitalize())
        names = [fd.get("name") for fd in fields if isinstance(fd, dict) and fd.get("name")]
        field_order.append((canonical, names))
        known.update(names)
    return field_order, known


def load_topic() -> str:
    try:
        with open(OUTLINE_PATH, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        return doc.get("topic", "Research report")
    except OSError:
        return "Research report"


def load_modules(path: Path) -> list:
    """Strategy module list from research.md front-matter, if present."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return []
    try:
        doc = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return []
    return doc.get("modules") or [] if isinstance(doc, dict) else []


def rank(value, table: dict) -> int:
    return table.get(str(value or "").strip().lower(), 9)


def truncate(text: str, limit: int) -> str:
    """Ellipsize text that exceeds limit chars (ellipsis included)."""
    return text if len(text) <= limit else text[: limit - 3] + "…"


def mix(field: str, items) -> str | None:
    """'N×value' mix line for a summary field, ordered by rank table."""
    c = Counter(it["meta"].get(field) for it in items if it["meta"].get(field))
    if not c:
        return None
    table = {"priority": PRIORITY_RANK, "severity": SEVERITY_RANK,
             "effort": {"s": 0, "m": 1, "l": 2}}.get(field)
    ordered = sorted(c, key=lambda k: (table.get(str(k).strip().lower(), 9), k) if table else k)
    return ", ".join(f"{c[k]}×{k}" for k in ordered)


def comp_bucket(s: str) -> str:
    return s.split("(", 1)[0].strip()                     # drop parenthetical detail


def stats_lines(coverage: float, total_items: int, resolved_items: int,
                resolved_fields: int, total_fields: int, sources_count: int) -> list:
    """Header stats block (shared verbatim by report.md and summary.md)."""
    return [f"- **Date:** {date.today().isoformat()}",
            f"- **Items:** {total_items} total, {resolved_items} fully resolved",
            f"- **Field coverage:** {resolved_fields}/{total_fields} ({coverage:.1%})",
            f"- **Unresolved fields:** {total_fields - resolved_fields}",
            f"- **Distinct sources cited:** {sources_count}"]


def exec_summary_lines(topic: str, total_items: int, waves: int, modules: list,
                       resolved_fields: int, total_fields: int, sources_count: int,
                       coverage: float, top: list, comps, items: list) -> list:
    """Executive Summary (shared verbatim by report.md and summary.md)."""
    lines = ["## Executive Summary", ""]
    para = f"This report presents {total_items} findings on **{topic}**"
    if waves:
        para += f", researched in {waves} OODA wave{'s' if waves != 1 else ''}"
    if modules:
        para += f" across {len(modules)} strategy modules ({', '.join(modules)})"
    para += (f". Field coverage is {resolved_fields}/{total_fields} ({coverage:.0%}) with "
             f"{total_fields - resolved_fields} unresolved; {sources_count} distinct sources ground the findings.")
    lines.append(para)
    for label, field in (("**Priority mix:**", "priority"), ("**Severity mix:**", "severity"),
                         ("**Effort mix:**", "effort")):
        m = mix(field, items)
        if m:
            lines.append(f"{label} {m}")
    if top:
        lines.append("")
        lines.append("**Top findings:**")
        for it in top:
            p = it["meta"].get("priority", "—")
            one = truncate(it["oneliner_text"] or it["name"], 160)
            lines.append(f"- **[{p}] [{it['name']}](#{it['anchor']})** — {one}")
    if comps:
        lines.append("")
        lines.append("**Most-affected surfaces:**")
        for comp, n in comps.most_common(5):
            lines.append(f"- {truncate(comp, 70)} — {n} item{'s' if n != 1 else ''}")
    return lines


def action_plan_lines(ranked: list, problem_col: bool = False) -> list:
    """Action Plan table. report.md shows the affected component; summary.md
    shows the item's one-line problem (~140 chars) instead."""
    lines = ["## Action Plan", ""]
    if problem_col:
        lines.append("| # | Finding | Severity | Priority | Effort | Problem |")
        lines.append("|---|---------|----------|----------|--------|---------|")
        for it in ranked:
            m = it["meta"]
            prob = truncate(it["oneliner_text"] or it["name"], 140).replace("|", "\\|")
            lines.append(f"| {it['number']} | [{it['name']}](#{it['anchor']}) | "
                         f"{m.get('severity', '—')} | {m.get('priority', '—')} | {m.get('effort', '—')} | {prob} |")
    else:
        lines.append("| # | Finding | Severity | Priority | Effort | Affected component |")
        lines.append("|---|---------|----------|----------|--------|---------------------|")
        for it in ranked:
            m = it["meta"]
            aff = truncate(m.get("affected_component", "—"), 48)
            lines.append(f"| {it['number']} | [{it['name']}](#{it['anchor']}) | "
                         f"{m.get('severity', '—')} | {m.get('priority', '—')} | {m.get('effort', '—')} | {aff} |")
    return lines


def shared_context_lines(items: list, patterns) -> list:
    """One '## Shared context' front-matter section for the report: repo anchor
    facts repeated across items, surfaced once. Only anchors mentioned in >= 2
    items render, most-repeated first. Empty when nothing qualifies."""
    total = len(items)
    if total < 2:
        return []
    hits = []
    for i, (label, pattern) in enumerate(patterns):
        rx = re.compile(pattern, re.I)
        count = sum(1 for it in items if rx.search(it["text"]))
        if count >= 2:
            hits.append((count, i, label))
    if not hits:
        return []
    hits.sort(key=lambda h: (-h[0], h[1]))
    lines = ["## Shared context", "",
             "Repo anchor facts repeated across findings, surfaced once instead of per item:"]
    for count, _, label in hits:
        lines.append(f"- {label} — mentioned in {count}/{total} items")
    return lines


def main() -> None:
    field_order, known = load_fields(FIELDS_PATH)
    topic = load_topic()
    modules = load_modules(RESEARCH_MD_PATH)

    items = []
    global_sources = {}                  # url -> [item numbers]
    total_items = total_fields = resolved_fields = 0
    resolved_items = 0
    provenance = []
    waves = 0

    for path in sorted(RESULTS_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:               # single-pass: open once
            data = json.load(f)

        total_items += 1
        number = total_items
        name = data.get("name") or path.stem.replace("_", " ").title()
        anchor = slugify(f"{number} {name}")
        uncertain = set(data.get("uncertain", []) or [])
        waves = max(waves, data.get("_wave") or 0)

        # full item text (every field value) for the shared-context anchor scan
        item_text = " ".join(fmt_value(v) for v in data.values())

        # meta values (rendered in the item meta line, not the body)
        meta = {}
        for sf in SUMMARY_FIELDS:
            v = lookup(data, sf)
            if v is not None and fmt_value(v):
                meta[sf] = fmt_value(v)

        # one-line summary (ux_issue by convention; generic fallback below)
        oneliner_label = oneliner_text = None
        v = lookup(data, SUMMARY_ONELINER)
        if v is not None and fmt_value(v):
            oneliner_label, oneliner_text = display_name(SUMMARY_ONELINER), fmt_value(v)
        else:
            for cat, fields in field_order:
                for f in fields:
                    if f in SUMMARY_FIELDS:
                        continue
                    v = lookup(data, f)
                    if v is None:
                        continue
                    text = fmt_value(v)
                    if text and len(text) <= 200:
                        oneliner_label, oneliner_text = display_name(f), text
                        break
                if oneliner_text:
                    break

        sections = []
        unresolved = []
        item_fields = 0
        for cat, fields in field_order:
            visible, collapsed = [], []
            for f in fields:
                item_fields += 1
                v = lookup(data, f)
                empty = v is None or v == "" or (isinstance(v, str) and not v.strip())
                if empty or f in uncertain or is_uncertain_value(v):
                    unresolved.append(f)
                    continue
                resolved_fields += 1
                text = fmt_value(v)
                if f in SUMMARY_FIELDS or f == SUMMARY_ONELINER:
                    continue                                  # already in meta line / summary
                (collapsed if len(text) > COLLAPSE_THRESHOLD else visible).append((f, text))
            if visible or collapsed:
                block = [f"### {cat}"]
                block += [render_field(display_name(f), t) for f, t in visible]
                if collapsed:
                    names = ", ".join(display_name(f) for f, _ in collapsed)
                    inner = "\n\n".join(render_field(display_name(f), t) for f, t in collapsed)
                    block.append(f"<details>\n<summary>{cat} — {names}</summary>\n\n{inner}\n</details>")
                sections.append("\n\n".join(block))
        total_fields += item_fields

        extras = [k for k in data if k not in known and k not in SKIP_TOP_LEVEL and not k.startswith("_")]
        if extras:
            sections.append("### Other Info\n\n"
                            + "\n\n".join(render_field(display_name(k), data[k]) for k in extras))

        if unresolved:
            prov = [f"**Unresolved:** {', '.join(unresolved)}"]
            attempts = data.get("_attempts") or []
            if attempts:
                for a in attempts:
                    prov.append(f"- Wave {a.get('wave', '?')} — angles: [{', '.join(a.get('angles', []))}], "
                                f"modules: [{', '.join(a.get('modules', []))}], outcome: {a.get('outcome', '?')}")
            provenance.append((name, prov))
        else:
            resolved_items += 1

        item_urls = []
        ev = lookup(data, "evidence")
        if ev:
            item_urls = extract_urls(ev)
            for url in item_urls:
                global_sources.setdefault(url, []).append(number)

        items.append({
            "number": number, "name": name, "anchor": anchor, "meta": meta,
            "oneliner_label": oneliner_label, "oneliner_text": oneliner_text,
            "sections": sections, "item_urls": item_urls, "text": item_text,
        })

    coverage = (resolved_fields / total_fields) if total_fields else 0.0

    ranked = sorted(items, key=lambda it: (rank(it["meta"].get("priority"), PRIORITY_RANK),
                                           rank(it["meta"].get("severity"), SEVERITY_RANK),
                                           it["number"]))
    top = [it for it in ranked if rank(it["meta"].get("priority"), PRIORITY_RANK) <= 1]

    comps = Counter(comp_bucket(it["meta"].get("affected_component", ""))
                    for it in items if it["meta"].get("affected_component"))

    # ---- body: per-item sections -------------------------------------------------
    body_parts = []
    for it in items:
        part = [f"## {it['number']}. {it['name']}", ""]
        if it["meta"]:
            part.append(" · ".join(f"**{display_name(k)}:** {v}" for k, v in it["meta"].items()))
            part.append("")
        if it["oneliner_text"]:
            part.append(f"> **{it['oneliner_label']}:** {it['oneliner_text']}")
            part.append("")
        part.append("\n\n".join(it["sections"]))
        if it["item_urls"]:
            part.append("")
            part.append("**Sources:** " + " · ".join(f"[{source_label(u)}]({source_href(u)})" for u in it["item_urls"]))
        body_parts.append("\n\n".join(part))

    # ---- assemble report ------------------------------------------------------
    shared = shared_context_lines(items, SHARED_CONTEXT_PATTERNS)
    lines = [f"# {topic} — Research Report", ""]
    lines += stats_lines(coverage, total_items, resolved_items, resolved_fields, total_fields,
                         len(global_sources))
    lines += ["", *exec_summary_lines(topic, total_items, waves, modules, resolved_fields,
                                      total_fields, len(global_sources), coverage, top, comps, items)]
    if shared:
        lines += ["", *shared]
    github_repos = extract_github_repos(items)
    disc_refs = discovered_references_lines(github_repos)
    if disc_refs:
        lines += ["", *disc_refs]
    lines += ["", *action_plan_lines(ranked)]
    lines += ["", "## Table of Contents", ""]
    for it in items:
        badges = [it["meta"][bf] for bf in TOC_BADGES if it["meta"].get(bf)]
        suffix = f" — {' · '.join(badges)}" if badges else ""
        lines.append(f"- {it['number']}. [{it['name']}](#{it['anchor']}){suffix}")

    lines += ["", "## Findings", ""]
    lines.extend(body_parts)

    if global_sources:
        lines += ["", "## Sources", ""]
        for i, (url, nums) in enumerate(sorted(global_sources.items(), key=lambda kv: kv[0].lower()), 1):
            lines.append(f"{i}. {source_href(url)} — items {', '.join(f'#{n}' for n in nums)}")

    if provenance:
        lines += ["", "## Unresolved Fields & Attempts", ""]
        for name, prov in provenance:
            lines.append(f"### {name}")
            lines.append("")
            lines.extend(prov)
            lines.append("")

    # ---- assemble summary (accessible digest) ----------------------------------
    summary = [f"# {topic} — Summary", ""]
    summary += stats_lines(coverage, total_items, resolved_items, resolved_fields, total_fields,
                           len(global_sources))
    summary += ["", *exec_summary_lines(topic, total_items, waves, modules, resolved_fields,
                                        total_fields, len(global_sources), coverage, top, comps, items)]
    if disc_refs:
        summary += ["", *disc_refs]
    summary += ["", *action_plan_lines(ranked, problem_col=True)]
    summary += ["", "## Notes", "",
                "Full detail and sources: report.md in this directory. Regenerate: "
                "python3 commands/research-report/generate_report.py <project_dir>"]

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:       # single write per file
        f.write("\n".join(lines))
    with open(SUMMARY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(summary))

    n_details = sum(p.count("<details>") for p in body_parts)
    print(f"Wrote {OUTPUT_PATH} ({len(lines)} lines) and {SUMMARY_OUTPUT_PATH} ({len(summary)} lines); "
          f"coverage {coverage:.1%}, {n_details} collapsible sections, {len(global_sources)} sources")


if __name__ == "__main__":
    main()
