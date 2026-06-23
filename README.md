# graphite-tui

[![CI](https://github.com/virajvchavan/graphite-tui/actions/workflows/ci.yml/badge.svg)](https://github.com/virajvchavan/graphite-tui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A keyboard-driven terminal UI for [Graphite](https://graphite.com) PR stacks —
a replacement for the Graphite VSCode extension's "Branches" sidebar.


Run `graphite-tui` inside any Graphite-initialized git repo and it renders the
repo's stacks with dependency lines, PR status, and age, fully controllable by
keyboard.

```
 GRAPHITE: BRANCHES  condor · develop                          press ? for help

 › ●    feat(forecasting): preserve percentage-split region…    #9268 review 2d
   ◯    test(forecasting): cover region allocation …           #9266 review 2d
   ◯    feat(forecasting): snapshot region allocation…         #9265 review 2d
   │ ◯  refactor(reporting): extract shared monthly-chart…     #9351 merged 2d
   ◯─┘  develop                                                            31h
```

## Install

```sh
git clone https://github.com/virajvchavan/graphite-tui.git
cd graphite-tui
npm install   # installs deps and builds (via the prepare script)
npm link      # exposes the global `graphite-tui` command
```

Then run `graphite-tui` from inside any Graphite-initialized repo.

Requires Node ≥ 18 and the [`gt`](https://graphite.com/docs/graphite-cli) CLI on
your PATH.

## Keys

| Key | Action |
|-----|--------|
| `↑`/`k`, `↓`/`j` | move selection |
| `Tab` | cycle focus across the working-tree, changed-files, and command-log panels (`Esc` back to branches) |
| `Enter` / `c` | checkout selected branch |
| `o` / `O` | open PR / stack page on Graphite |
| `g` | open PR on GitHub |
| `s` | sync with trunk (`gt sync`) |
| `r` | restack (`gt restack`) |
| `S` | submit stack (`gt submit --stack`) |
| `d` | delete branch (with confirmation) |
| `/` | fuzzy filter by branch name / PR title |
| `y` | copy PR url or branch name |
| `R` | refresh |
| `?` | help · `q` quit |

### Working tree

A **working tree** panel shows your live uncommitted changes (staged, unstaged,
and untracked) for the current branch, with the two-char git status and per-file
line counts. `Tab` to it, then:

| Key | Action |
|-----|--------|
| `a` / `A` | stage file under cursor / all (`git add`) |
| `u` / `U` | unstage file under cursor / all (`git restore --staged`) |
| `space` | toggle stage/unstage of the file under cursor |
| `x` / `X` | discard file under cursor / all changes (with confirmation) |
| `m` | amend staged changes into the current branch (`gt modify`) |
| `c` | add staged changes as a new commit with a message (`gt modify -c -m`) |
| `m` / `c` *(on trunk)* | create a new branch from the staged changes (`gt create -m`) |

It refreshes after each action, when the terminal regains focus, when `.git`
changes, and on a 60s poll backstop (so external editor saves show up too).

A panel below the graph lists the files each branch's PR changes (its diff
against its parent), colored by git status. It updates as you move between
branches; press `Tab` to focus and scroll it. On a short terminal this panel
collapses to its header to keep the branch list and working tree visible —
focus it and press `Enter` to expand it.

Branches out of date with their parent show `⇈ restack` (yellow). If a
`gt sync`/`gt restack` is paused on merge conflicts, the branch being rebased is
flagged `⚠ conflict` (red) and a banner shows the conflicted-file count and how
to resolve.

The view auto-refreshes when you run `gt` in another terminal.

## How it works

`gt log` has no machine-readable output, so the view is built by reading
Graphite's local caches directly (fast, exact):

- **Tree structure** — `.git/.graphite_metadata.db` (SQLite `branch_metadata`)
- **PR metadata** — `.git/.graphite_pr_info` (JSON)
- **Trunk** — `.git/.graphite_repo_config`
- **Ages / current branch** — `git for-each-ref` / `git branch --show-current`
- **Changed files** — `git diff --name-status <parent>...<branch>`
- **Working tree** — `git status --porcelain=v1 -z`
- **In-progress conflicts** — `.git/rebase-merge` + `git diff --diff-filter=U`

Mutations (checkout, sync, restack, submit, delete; staging, discarding, and
`gt modify` on the working tree) and opening PRs shell out to `gt`/`git`. All
Graphite-format parsing is isolated in `src/data/` so a `gt` format change is a
one-place fix.

## Develop

```sh
npm run dev    # run from source via tsx
npm test       # unit tests for the graph layout
npm run build  # compile to dist/
```
