import type { RenderRow } from "../types.js";

export interface GraphCell {
  /** Primary glyph for this column (node, line, corner, or space). */
  glyph: string;
  /** True when this cell is the branch's node (colored distinctly). */
  isNode: boolean;
  /** Connector char drawn to the right of the glyph (horizontal line or space). */
  after: string;
}

// All node glyphs come from the same small-circle family (U+25CF/CB/CC): the
// large ring U+25EF renders two columns wide in many terminal fonts, which
// knocked every hollow-node row one column out of line with the current one.
const NODE_CURRENT = "●";
const NODE_TRUNK = "○";
const NODE_DEFAULT = "○";
// Dotted ring for a branch that needs a restack (stale parent), mirroring the
// dotted edges Graphite's other clients draw for out-of-date branches.
const NODE_RESTACK = "◌";

/**
 * Build the per-column gutter cells for a row. Each cell is 2 chars wide
 * (glyph + right connector) so horizontal merges (`○─┴─┘`) and parallel
 * vertical lines (`│ ○`) line up across rows.
 */
export function buildGutter(row: RenderRow, columnCount: number): GraphCell[] {
  const nodeCol = row.column;
  const mergeCols = row.mergeFrom;
  const maxMerge = mergeCols.length ? Math.max(...mergeCols) : -1;

  // True where the horizontal run from the node out to the outermost merge
  // passes through column `c`.
  const crosses = (c: number) => c > nodeCol && c < maxMerge;

  const cells: GraphCell[] = [];
  for (let c = 0; c < columnCount; c++) {
    let glyph = " ";
    let isNode = false;
    if (c === nodeCol) {
      glyph = row.branch.isTrunk
        ? NODE_TRUNK
        : row.branch.needsRestack
          ? NODE_RESTACK
          : row.isCurrent
            ? NODE_CURRENT
            : NODE_DEFAULT;
      isNode = true;
    } else if (mergeCols.includes(c)) {
      // Only the outermost merge is a corner; nearer ones are tees, because the
      // horizontal run to the node continues past them.
      glyph = c < maxMerge ? "┴" : "┘";
    } else if (row.through[c]) {
      glyph = crosses(c) ? "┼" : "│";
    } else if (crosses(c)) {
      glyph = "─";
    }

    // Horizontal connector between this column and the next when a merge
    // corner sits to the right of the node.
    const after = maxMerge > nodeCol && c >= nodeCol && c < maxMerge ? "─" : " ";
    cells.push({ glyph, isNode, after });
  }
  return cells;
}
