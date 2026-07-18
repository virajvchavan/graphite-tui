# FAQ

## Does graphite-tui modify my repo?

Only when you ask it to. Navigation and viewing are read-only; actions like
checkout, sync, restack, submit, stage, and discard shell out to `gt`/`git`
exactly as you would on the command line.

## Can I use it without a Graphite account?

You need the `gt` CLI initialized in the repo (`gt init`). PR metadata and CI
status come from GitHub via `gh`, so those panels light up once you're authed.

## Why a TUI instead of the VSCode extension?

Same stack view, but keyboard-driven and terminal-native — no editor required,
and it stays out of your way while you work.
