# Watch mode

graphite-tui keeps the working-tree and changed-files panels live while you
work — no manual refresh needed.

## How it works

Rather than polling on a timer, the app subscribes to filesystem events for the
repo and re-reads git status only when something actually changes. That keeps
idle CPU near zero while staying responsive the instant you save a file.

## What triggers a refresh

- Staging, unstaging, or discarding changes.
- Editing, creating, or deleting tracked files.
- Branch checkouts and other git operations that move `HEAD`.

## Pausing

Live reload is suspended while a `gt` action is in flight, so a sync or restack
won't fight the watcher for the working tree, then resumes automatically.

## Manual refresh

You can always force an immediate re-read with `R` — handy on filesystems that
don't emit reliable change events.
