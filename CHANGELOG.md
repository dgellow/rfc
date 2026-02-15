# Changelog

## 0.0.3

### Bug Fixes

- add continue-on-error to npm publish steps <details><summary>Details</summary>
  npm can return errors even on successful publishes, which blocks
  remaining packages from being published.
</details>


### CI

- add test and build jobs, improve build script <details><summary>Details</summary>
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
