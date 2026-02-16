# Changelog

## 0.0.5

### Chores

- upgrade to weew 0.4.0: AppContext → RunControl

## 0.0.4

### Bug Fixes

- batch relation queries, race conditions, navigation edge cases
  <details><summary>Details</summary>
  - Batch-load relations in search (2 queries instead of 4ÃN), add indexes
  - Add generation counter to prevent stale async openRfc updates
  - Guard all navigation keys against empty results
  - Fix Shift+Tab swallowed by Tab (check order)
  - Author search case-insensitive (COLLATE NOCASE)
  - Skip year filter on NaN input
  - Always show reader hints (don't replace with breadcrumb)
  - Replace frozen spinner with static loading text
  - Show search errors in result area
  - Reset content search state when returning to search screen
  - Add --version/-V flag
  - Add 8 new tests for edge cases

</details>

- use OIDC auth for npm publish, remove NODE_AUTH_TOKEN
- publish steps use if: always() to fail job on error

### Chores

- consolidate data under ~/.config/rfc, improve sync UX
  <details><summary>Details</summary>
  - Move all data (DB, RFCs, config) into single ~/.config/rfc directory
  - Timer-based spinner for all sync phases (fetch, parse, rsync, index)
  - Spinner shows "Done." on each step, summary at end
  - Add `rfc sync --clear` to delete local data with confirmation
  - `--help` flag works anywhere in command (e.g. `rfc sync --help`)

</details>

- upgrade to weew 0.3.0: closure-based state, case-sensitive isKey

### ui

- remove outer frame, fix keymaps, improve search highlights and sync output
  <details><summary>Details</summary>
  - Remove Box border from search and reader screens, use plain Column
  - Gate vim keys (j/k/g/G/h/l//) behind keymap check so they don't fire in
    emacs mode
  - Add emacs C-v/M-v (edge-then-page) and M-&lt;/M-&gt; for browse list
  - Fix Shift+Tab ordering (check before Tab)
  - Search highlight: dim row bg, bold matched text within line
  - Add p as prev match alias, show n/p hint only when matches active
  - Show match positions in scrollbar
  - Use square borders for info/help overlays
  - Clean up sync/index output: spinner, colored messages, rsync progress
  - Use ~/.config and ~/.cache on all platforms (drop macOS Library paths)
  - Show index/cache/config paths in --help
  - Mock fetchRfc in tests, remove sanitizeOps workarounds
  - Keymap-aware "/ to search" vs "C-s to search" placeholder

</details>

## 0.0.3

### Bug Fixes

- add continue-on-error to npm publish steps <details><summary>Details</summary>
  npm can return errors even on successful publishes, which blocks remaining
  packages from being published.

</details>

### CI

- add test and build jobs, improve build script
  <details><summary>Details</summary>
  - CI now runs ./scripts/lint, ./scripts/test, and ./scripts/build
  - scripts/build does deno compile + npm build for current platform
  - Ignore build/ output directory

</details>

## 0.0.2

### Chores

- Adopt weew 0.2.0 patterns, add keymap toggle, remove search limit
  <details><summary>Details</summary>
  - Delegate text editing in search input and content search to
    TextInput.handleKey
  - Replace manual result list rendering with VirtualList (virtualized +
    scrollbar)
  - Remove --debug-keys flag and debug file logging
  - Remove 500-result search limit (VirtualList handles full result sets)
  - Add K (shift) keymap toggle between vim/emacs, persisted to config file
  - Add TUI key handling tests using weew TestDriver (25 tests)
  - Add scripts/test, CLAUDE.md

</details>

- ci stuff
- formatting
