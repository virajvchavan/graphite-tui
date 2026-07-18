# Theming

graphite-tui adapts its colors to your terminal automatically, and lets you
override the result when the guess is wrong.

## Automatic detection

On startup the app inspects the terminal background to decide between a light
and dark palette. Most modern terminals report this correctly, so you usually
don't need to configure anything.

## Overriding the palette

Set an environment variable before launching if you want to force a mode:

```sh
GRAPHITE_TUI_THEME=dark graphite-tui
GRAPHITE_TUI_THEME=light graphite-tui
```

## Status colors

PR state drives the accent color on each row:

- **review** — awaiting review
- **approved** — ready to merge
- **merged** — landed on trunk
- **draft** — not yet ready

These map onto your terminal's ANSI palette so they stay readable in both light
and dark themes.
