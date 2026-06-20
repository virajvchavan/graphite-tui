import type { Branch, RenderRow, RepoData } from "../types.js";

/**
 * Build a flattened, renderable list of rows from the branch forest.
 *
 * Layout convention (matches `gt log` / the Graphite sidebar):
 *  - Trunk is rendered at the BOTTOM; stacks grow upward.
 *  - A branch's first child continues its column; additional children get
 *    new columns to the right, so sibling stacks render in parallel.
 *  - Tips appear at the top; a parent always renders below all its descendants.
 *
 * The recursion emits, for each branch: all child subtrees first (top), then
 * the branch itself (bottom). The first child shares the parent's column.
 */
export function buildRenderRows(data: RepoData): RenderRow[] {
  const { branches, trunk, currentBranch } = data;

  // Memoized subtree metrics, used to order siblings so the most relevant
  // stack (the one holding the current branch, then the largest) takes the
  // primary column 0.
  const sizeCache = new Map<string, number>();
  const hasCurrentCache = new Map<string, boolean>();

  const rawChildren = (b: Branch): Branch[] =>
    b.children
      .map((name) => branches.get(name))
      .filter((x): x is Branch => Boolean(x));

  const subtreeSize = (b: Branch): number => {
    const cached = sizeCache.get(b.name);
    if (cached !== undefined) return cached;
    let n = 1;
    for (const c of rawChildren(b)) n += subtreeSize(c);
    sizeCache.set(b.name, n);
    return n;
  };
  const subtreeHasCurrent = (b: Branch): boolean => {
    const cached = hasCurrentCache.get(b.name);
    if (cached !== undefined) return cached;
    let found = b.name === currentBranch;
    if (!found) found = rawChildren(b).some((c) => subtreeHasCurrent(c));
    hasCurrentCache.set(b.name, found);
    return found;
  };

  // Children ordered so the first child continues the primary column: the
  // subtree containing the current branch wins, then the larger subtree.
  const childrenOf = (b: Branch): Branch[] =>
    rawChildren(b).sort((a, c) => {
      const ac = subtreeHasCurrent(a) ? 1 : 0;
      const cc = subtreeHasCurrent(c) ? 1 : 0;
      if (ac !== cc) return cc - ac;
      return subtreeSize(c) - subtreeSize(a);
    });

  let nextColumn = 1; // column 0 is reserved for the trunk's primary chain
  // Pre-pass: emit rows with branch + column (top-to-bottom).
  interface Pre {
    branch: Branch;
    depth: number;
    column: number;
  }
  const pre: Pre[] = [];

  const visit = (branch: Branch, column: number, depth: number): void => {
    const kids = childrenOf(branch);
    kids.forEach((child, i) => {
      const childColumn = i === 0 ? column : nextColumn++;
      visit(child, childColumn, depth + 1);
    });
    pre.push({ branch, column, depth });
  };

  // Roots = trunk branches only. Everything shown is reachable from a trunk
  // by walking children, which excludes the many local git branches Graphite
  // isn't tracking (validation_result BAD_PARENT_NAME, no parent/children).
  const roots: Branch[] = [];
  const trunkBranch = branches.get(trunk);
  if (trunkBranch) roots.push(trunkBranch);
  for (const b of branches.values()) {
    if (b.isTrunk && !roots.includes(b)) roots.push(b);
  }

  for (const root of roots) {
    visit(root, 0, 0);
  }

  // Index by branch name -> row position, for edge/through computation.
  const rowIndex = new Map<string, number>();
  pre.forEach((p, i) => rowIndex.set(p.branch.name, i));

  const maxColumn = pre.reduce((m, p) => Math.max(m, p.column), 0);
  const rows: RenderRow[] = pre.map((p) => ({
    branch: p.branch,
    depth: p.depth,
    column: p.column,
    through: new Array(maxColumn + 1).fill(false),
    mergeFrom: [],
    isCurrent: p.branch.name === currentBranch,
  }));

  // Compute edges (child -> parent). Child is above (smaller index) its parent.
  for (let i = 0; i < pre.length; i++) {
    const { branch, column } = pre[i];
    const parentName = branch.parent;
    if (!parentName) continue;
    const pIdx = rowIndex.get(parentName);
    if (pIdx === undefined) continue;
    const parentColumn = pre[pIdx].column;

    // Vertical line in this branch's column for the rows strictly between
    // the child and its parent.
    for (let r = i + 1; r < pIdx; r++) {
      rows[r].through[column] = true;
    }
    // If the child sits in a different column than its parent, it merges
    // into the parent's node on the parent's row.
    if (column !== parentColumn) {
      rows[pIdx].mergeFrom.push(column);
    }
  }

  return rows;
}

/** Find the render-row index of a branch by name. */
export function indexOfBranch(rows: RenderRow[], name: string | null): number {
  if (!name) return -1;
  return rows.findIndex((r) => r.branch.name === name);
}
