---
name: using-tern
description: Drive the Tern terminal through its `tern` CLI from bash. Use when the session runs in Tern and a long-running process (dev server, watcher, long build) should live in its own pane, when you want to read another pane's output, or when the user asks to inspect or arrange Tern sessions, tabs and panes.
---

# Using Tern

[Tern](https://stencil.so/tern) is a terminal whose session daemon keeps panes ("blocks") alive between windows. omp already draws natively in it; this skill covers the `tern` CLI, which works from any shell, including WSL. Every command takes `--json`; `tern COMMAND --help` shows one command.

## Find your bearings

- `tern ls` lists sessions, tabs and blocks with their ids. A block running omp is titled with the omp session title, so find your own pane by that title.
- `tern inspect --json` adds per-pane `program`, `cwd`, `working` and `quiet_ms`.
- Address a block as `SESSION/BLOCK` (an id, title or program name). Avoid `@focused`: it is wherever the user's cursor is, not you.

## Run a long process in its own session

Keep your work out of the user's tabs: create a named session, type into it, read it back, kill it when done.

```sh
S=$(tern new session dev-server --keep-open --json)   # {"session":…,"tab":…,"block":…}
B=dev-server/$(echo "$S" | sed -n 's/.*"block": *\([0-9]*\).*/\1/p')
tern wait "$B" --until idle=500 --timeout 10           # let the new shell finish starting
tern run "$B" 'cd /abs/path/to/repo && npm run dev; echo "__DONE_$?"'
tern capture "$B" | grep -v '^\s*$' | tail -20          # read the latest output
tern capture "$B" | grep -oE '__DONE_[0-9]+' | tail -1  # empty until the command finished
tern kill session dev-server
```

- `tern` is a Windows binary when called from WSL: its JSON has CRLF line endings, and `jq` may be missing, so parse ids with `sed` as above.
- The new shell starts wherever its profile puts it (often `~`), not in your cwd: always `cd` to an absolute path first.
- The `__DONE_<status>` marker tells you the command finished and its exit status. Match digits (`__DONE_[0-9]+`), or you will match the echoed command line itself.
- `tern wait BLOCK --until idle=MS` returns once the pane prints nothing for MS milliseconds. It fires during silent stretches (a `sleep`, a quiet compile step), so treat it as "output settled", never as "finished".
- `tern send BLOCK keys ctrl+c` interrupts the program; bash then drops the rest of the line, so no marker appears. `tern send BLOCK text '…'` types without Enter.

## Show the user a file

`tern open --tab PATH[:LINE[:COL]]` opens a file block in the user's window (`--split right|down` puts it beside the current block). Use it when the user asks to see a file or a location, not as a way for you to read files.

## Known limits from WSL

From a WSL shell (Tern 0.9.x), these did not work in testing: `tern wait --until prompt` and `--until exit` time out with "the session daemon did not answer", and a `-- COMMAND` after `new`/`split` is ignored (the block starts a plain WSL shell). Use `tern run` plus the done marker instead.

## Policy

- Never type into, send keys to, close or kill a block you did not create unless the user asked.
- Close what you started (`tern kill session NAME`, `tern close BLOCK`) before you finish.
