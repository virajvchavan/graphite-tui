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
