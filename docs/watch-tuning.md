# Tuning watch mode

Watch mode is on by default and needs no configuration, but a few knobs help on
unusual setups.

## Large repositories

On very large working trees the initial status read can take a moment. The
watcher debounces bursts of filesystem events so a big checkout or branch switch
only triggers a single refresh, not one per file.

## Network and virtual filesystems

Some network mounts and virtual filesystems don't emit reliable change events.
If live updates seem to stop, press `R` to force a refresh — the panels will
re-read git status immediately.

## Comparing with polling

The previous polling approach refreshed on a fixed interval, which wasted CPU
when idle and lagged by up to the interval when busy. Event-driven watching
gives both: quiet when nothing changes, instant when it does.
