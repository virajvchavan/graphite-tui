#!/usr/bin/env node
import { loadRepoData } from "./data/load.js";
import { buildRenderRows } from "./model/tree.js";
import {
  NotAGitRepoError,
  NotAGraphiteRepoError,
} from "./data/repo.js";

function fail(message: string): never {
  process.stderr.write(`graphite-tui: ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      `graphite-tui — keyboard-driven TUI for Graphite PR stacks\n\n` +
        `Usage: graphite-tui [--debug-dump]\n\n` +
        `Run inside a Graphite-initialized git repo. Keys: ?  for help.\n`
    );
    return;
  }

  let loaded;
  try {
    loaded = loadRepoData(cwd);
  } catch (err) {
    if (err instanceof NotAGitRepoError || err instanceof NotAGraphiteRepoError) {
      fail(err.message);
    }
    throw err;
  }

  if (args.includes("--debug-dump")) {
    const rows = buildRenderRows(loaded.data);
    const out = {
      repoRoot: loaded.data.repoRoot,
      trunk: loaded.data.trunk,
      currentBranch: loaded.data.currentBranch,
      rows: rows.map((r) => ({
        name: r.branch.name,
        title: r.branch.displayTitle,
        column: r.column,
        depth: r.depth,
        through: r.through,
        mergeFrom: r.mergeFrom,
        isCurrent: r.isCurrent,
        isTrunk: r.branch.isTrunk,
        pr: r.branch.pr
          ? {
              number: r.branch.pr.prNumber,
              state: r.branch.pr.state,
              review: r.branch.pr.reviewDecision,
              draft: r.branch.pr.isDraft,
            }
          : null,
        age: r.branch.age,
        needsRestack: r.branch.needsRestack,
      })),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }

  const { render } = await import("ink");
  const React = await import("react");
  const { App } = await import("./ui/App.js");
  const app = render(
    React.createElement(App, { initial: loaded.data, paths: loaded.paths })
  );
  await app.waitUntilExit();
}

main().catch((err) => {
  fail(err?.stack || String(err));
});
