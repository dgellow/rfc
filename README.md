# rfc

Read, search, and navigate IETF RFCs from your terminal.

## Install

```
deno install --allow-net --allow-read --allow-write --allow-env --allow-run --allow-ffi --name rfc main.ts
```

## Usage

```
rfc                      Interactive TUI
rfc <number>             Read in $PAGER
rfc search <query>       Search RFCs
rfc info <number>        Show metadata
rfc sync                 Download all RFCs via rsync
rfc sync --index         Refresh the index only
rfc list                 List cached RFCs
rfc path <number>        Print local file path
```

### Search

Free text and structured queries, powered by SQLite FTS5:

```
rfc search HTTP/2
rfc search author:fielding
rfc search status:standard wg:httpbis
rfc search year:2022 TLS
```

### TUI

`rfc` with no arguments opens an interactive interface with search, filtering by status, an RFC reader with in-document search, metadata panel, and cross-reference navigation.

Supports vim (default) and emacs keybindings. Set `RFC_KEYMAP=emacs` or press `?` for help.

## Data

RFCs are cached locally in `~/.cache/rfc/` (Linux) or `~/Library/Caches/rfc/` (macOS). The index is fetched from [rfc-editor.org](https://www.rfc-editor.org/) on first run and refreshed daily. Individual RFCs are fetched on demand and cached permanently.

## Dependencies

- [Deno](https://deno.com)
- [@dgellow/weew](https://jsr.io/@dgellow/weew) — TUI
- [@libs/xml](https://jsr.io/@libs/xml) — XML parsing
- [@db/sqlite](https://jsr.io/@db/sqlite) — SQLite + FTS5
