# Recipes & workflows

A few common ways to drive your day-to-day stack work from graphite-tui.

## Ship a small change on top of trunk

1. Make your edit and stage it.
2. Press `S` to submit the stack — the PR opens with your commit message as the
   title.
3. Once it's approved and merged, press `s` to sync trunk and clean up.

## Split a big branch into a reviewable stack

Rather than one giant PR, stack the work:

1. Commit the first logical chunk, then repeat for each following chunk.
2. Each chunk becomes its own row with a dependency line to its parent.
3. Reviewers can approve from the bottom up while you keep building on top.

## Jump around a large stack

- `/` fuzzy-filters by branch name or PR title — handy in deep stacks.
- `↑`/`↓` (or `k`/`j`) move the selection; focus crosses panels with `Tab`.
- `y` copies the selected PR URL to paste into Slack or a review thread.
