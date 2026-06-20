# Contributing to graphite-tui

Thanks for your interest in improving graphite-tui! Contributions are welcome.

## Getting started

```sh
git clone https://github.com/virajvchavan/graphite-tui.git
cd graphite-tui
npm install        # installs deps and builds (via the prepare script)
npm link           # exposes the global `graphite-tui` command for testing
```

You'll need Node ≥ 18 and the [`gt`](https://graphite.com/docs/graphite-cli)
CLI on your PATH, plus a Graphite-initialized repo to test against.

## Development workflow

```sh
npm run dev        # run from source via tsx (no build step)
npm test           # run the unit tests (vitest)
npm run build      # type-check and compile to dist/
```

Please run `npm run build` and `npm test` before opening a PR.

## How it's organized

The Graphite data formats are read directly from the repo's `.git/` directory.
All format-specific parsing is isolated under `src/data/`, so a change to how
`gt` stores data is a one-place fix. See the "How it works" section of the
[README](./README.md) for the data sources.

- `src/data/`    — read Graphite caches + git (pure, no UI)
- `src/model/`   — build the branch graph / render rows
- `src/ui/`      — Ink (React) components
- `src/actions/` — shell out to `gt` for mutations

## Guidelines

- Keep the data layer pure and isolated from the UI.
- Add or update a test in `*.test.ts` when you change graph layout or the
  needs-restack / data logic.
- Match the existing code style; keep changes focused.

## Reporting bugs

Open an issue with your `gt --version`, OS, and steps to reproduce. Since the
tool reads private Graphite cache formats, including the relevant
`.git/.graphite_*` shape (with anything sensitive redacted) helps a lot.
