# rfc

Read, search, and navigate IETF RFCs from your terminal.

## Install

From JSR:

```
deno install -g -A --name rfc jsr:@dgellow/rfc/cli
```

From source:

```
git clone https://github.com/dgellow/rfc && cd rfc
deno task install
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

CLI output is colored by default. Respects `$NO_COLOR`. Use `--no-color` to disable.

### TUI

`rfc` with no arguments opens an interactive browser.

- `/` to search, `j`/`k` to navigate, `Enter` to open
- `Tab` to filter by status, `s` to cycle sort order
- `i` for metadata panel, `?` for full keybindings
- In-document search, cross-reference navigation, history

Supports vim (default) and emacs keybindings. Set `RFC_KEYMAP=emacs`.

### Library

```ts
import { ensureIndex, search, getRfc } from "jsr:@dgellow/rfc";

const db = await ensureIndex();
const { results } = search(db, "HTTP semantics", { orderBy: "relevance" });
```

## Data

RFCs are cached locally in `~/.cache/rfc/` (Linux) or `~/Library/Caches/rfc/`
(macOS). The index is fetched from [rfc-editor.org](https://www.rfc-editor.org/)
on first run and refreshed daily. Individual RFCs are fetched on demand and
cached permanently.

## Dependencies

- [Deno](https://deno.com)
- [@dgellow/weew](https://jsr.io/@dgellow/weew) — TUI
- [@libs/xml](https://jsr.io/@libs/xml) — XML parsing
- [@db/sqlite](https://jsr.io/@db/sqlite) — SQLite + FTS5
