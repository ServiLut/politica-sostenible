export interface ProjectedTerritory<T> {
  item: T;
  x: number;
  y: number;
}

export interface TerritoryMapMarker<T> {
  x: number;
  y: number;
  items: T[];
}

/** Group nearby public locations without summing or revealing protected metrics.
 * The first location anchors each group; a 52px separation keeps 44px targets
 * distinct, including the clamped edges of the canvas. */
export function groupTerritoryMarkers<T extends { id: string }>(
  points: ReadonlyArray<ProjectedTerritory<T>>,
  width: number,
  height: number,
): TerritoryMapMarker<T>[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 48 || height < 48) return [];
  const groups: Array<TerritoryMapMarker<T> & { px: number; py: number }> = [];
  for (const point of [...points].sort((a, b) => a.item.id.localeCompare(b.item.id))) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const px = Math.max(24, Math.min(width - 24, point.x / 100 * width));
    const py = Math.max(24, Math.min(height - 24, point.y / 100 * height));
    const nearby = groups.find(group => Math.max(Math.abs(group.px - px), Math.abs(group.py - py)) < 52);
    if (nearby) nearby.items.push(point.item);
    else groups.push({ px, py, x: px / width * 100, y: py / height * 100, items: [point.item] });
  }
  return groups.map(({ x, y, items }) => ({ x, y, items }));
}
