import type { RenderRow } from "../types.js";

export interface GraphCell {
  /** Primary glyph for this column (node, line, corner, or space). */
  glyph: string;
  /** True when this cell is the branch's node (colored distinctly). */
  isNode: boolean;
  /** Connector char drawn to the right of the glyph (horizontal line or space). */
  after: string;
}

const NODE_CURRENT = "●";
const NODE_TRUNK = "◯";
const NODE_DEFAULT = "◯";

/**
 * Build the per-column gutter cells for a row. Each cell is 2 chars wide
 * (glyph + right connector) so horizontal merges (`◯─┘`) and parallel
 * vertical lines (`│ ◯`) line up across rows.
 */
export function buildGutter(row: RenderRow, columnCount: number): GraphCell[] {
  const nodeCol = row.column;
  const mergeCols = row.mergeFrom;
  const maxMerge = mergeCols.length ? Math.max(...mergeCols) : -1;

  const cells: GraphCell[] = [];
  for (let c = 0; c < columnCount; c++) {
    let glyph = " ";
    let isNode = false;
    if (c === nodeCol) {
      glyph = row.branch.isTrunk
        ? NODE_TRUNK
        : row.isCurrent
          ? NODE_CURRENT
          : NODE_DEFAULT;
      isNode = true;
    } else if (mergeCols.includes(c)) {
      glyph = "┘";
    } else if (row.through[c]) {
      glyph = "│";
    }

    // Horizontal connector between this column and the next when a merge
    // corner sits to the right of the node.
    const after = maxMerge > nodeCol && c >= nodeCol && c < maxMerge ? "─" : " ";
    cells.push({ glyph, isNode, after });
  }
  return cells;
}
