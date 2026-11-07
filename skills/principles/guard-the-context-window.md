# Guard the Context Window

Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads.

Protect working context memory. Delegate bulk investigation, raw file processing, and log inspection to subagents, returning only concise summaries to the main coordination thread.

**Why:** Context overflow degrades model reasoning quality, produces compression artifacts, causes lost instructions, and halts multi-step execution.

- **Size phases and cap scope:** Limit the number of files touched per phase, set explicit turn boundaries, and scope each sub-task to a single cohesive unit.
- **Offload bulk reads and exploration:** Never dump raw multi-megabyte logs, complete file trees, or sprawling search results into the primary session. Use targeted commands (`read` line ranges, `find`, `grep`) or delegate exploration to subagents via `task`.
- **Return summaries, not raw payloads:** When child subagents finish, require concise, structured findings: exact file locations, confirmed facts, and actionable conclusions, omitting full transcripts or unparsed data dumps.
- **Reference local artifacts:** Store large intermediate results in files on disk and pass file paths rather than inlining large payloads across prompt turns.
- **Avoid repeated reads:** Inspect the diff or read specific target lines once rather than repeatedly re-reading identical files throughout a workflow.

This is the automated agent analog of [skill://principles/minimize-reader-load.md](minimize-reader-load.md); working memory is finite for human readers and language models alike.
