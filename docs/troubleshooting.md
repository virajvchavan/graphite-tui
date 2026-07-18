# Troubleshooting

## "Not a Graphite repo"

graphite-tui reads the stack metadata that the `gt` CLI writes into `.git/`. If
you see this message, run `gt init` in the repo first, then relaunch.

## PR status looks stale

Status is refreshed from GitHub in the background. Press `R` to force a refresh,
or `s` to sync with trunk if branches were merged elsewhere.

## Nothing shows up under a branch

The changed-files and diff panels only populate for the checked-out branch and
its working tree. Press `Enter` to check out the selected branch, then `Tab`
into the files panel.

## Colors look wrong

Your terminal may be misreporting its background. Force a palette with
`GRAPHITE_TUI_THEME=dark` or `=light` — see [theming](./theming.md).

## `gt` command not found

graphite-tui shells out to `gt`. Make sure the Graphite CLI is installed and on
your `PATH`: <https://graphite.com/docs/graphite-cli>.
