/**
 * Scroll offset for a windowed list that keeps `selected` centered while
 * clamping to the list bounds (so the first/last items aren't over-scrolled).
 */
export function centeredOffset(
  selected: number,
  visible: number,
  total: number
): number {
  const maxOffset = Math.max(0, total - visible);
  const ideal = selected - Math.floor(visible / 2);
  return Math.min(maxOffset, Math.max(0, ideal));
}

/**
 * Scroll offset for a windowed list that keeps `cursor` visible by scrolling
 * only as far as needed (cursor pinned to the bottom edge once it passes the
 * last visible row), clamped to the list bounds.
 */
export function keepVisibleOffset(
  cursor: number,
  visible: number,
  total: number
): number {
  const maxOffset = Math.max(0, total - visible);
  const ideal = cursor < visible ? 0 : cursor - visible + 1;
  return Math.min(maxOffset, ideal);
}
