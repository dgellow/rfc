# rfc

## Scripts

- `./scripts/format` — format all files (deno fmt)
- `./scripts/lint` — format check + type check + lint (deno fmt --check, deno
  check, deno lint)
- `./scripts/test` — run tests (deno test with required permissions)
- `./scripts/build [platform]` — deno compile + npm build (auto-detects
  platform, or pass e.g. `linux-x64`)
- `./scripts/start` — start the app

Always use these scripts instead of running deno commands directly.
