import { expect, test } from "@playwright/test";
import { groupTerritoryMarkers } from "./territory-map-markers";

test("mantiene todos los municipios y separa los blancos táctiles incluso en los bordes", () => {
  const points = Array.from({ length: 125 }, (_, i) => ({ item: { id: `municipio-${String(i).padStart(3, '0')}` }, x: i % 25 * 4, y: Math.floor(i / 25) * 20 }));
  const groups = groupTerritoryMarkers(points, 244, 320);
  expect(groups.length).toBeLessThan(points.length);
  expect(groups.flatMap(g => g.items.map(i => i.id)).sort()).toEqual(points.map(p => p.item.id).sort());
  for (const [index, group] of groups.entries()) {
    const x = group.x / 100 * 244, y = group.y / 100 * 320;
    expect(x).toBeGreaterThanOrEqual(24); expect(x).toBeLessThanOrEqual(220);
    expect(y).toBeGreaterThanOrEqual(24); expect(y).toBeLessThanOrEqual(296);
    for (const other of groups.slice(index + 1)) expect(Math.max(Math.abs(x - other.x / 100 * 244), Math.abs(y - other.y / 100 * 320))).toBeGreaterThanOrEqual(51.999);
  }
});

test("la ampliación separa localizaciones cercanas y la agrupación no inventa métricas", () => {
  const points = [{ item: { id: 'a', value: null, suppressed: true }, x: 40, y: 40 }, { item: { id: 'b', value: 3, suppressed: false }, x: 50, y: 50 }];
  expect(groupTerritoryMarkers(points, 244, 320)).toHaveLength(1);
  expect(groupTerritoryMarkers(points, 976, 1280)).toHaveLength(2);
  const group = groupTerritoryMarkers(points, 244, 320)[0];
  expect(Object.keys(group).sort()).toEqual(['items', 'x', 'y']);
  expect(group.items[0]).toEqual({ id: 'a', value: null, suppressed: true });
  expect(points[0].item.value).toBeNull();
});

test("orden estable y dimensiones inválidas no producen marcadores falsos", () => {
  const points = [{ item: { id: 'b' }, x: 40, y: 40 }, { item: { id: 'a' }, x: 40, y: 40 }];
  expect(groupTerritoryMarkers(points, 300, 320)).toEqual(groupTerritoryMarkers([...points].reverse(), 300, 320));
  expect(groupTerritoryMarkers(points, 0, 320)).toEqual([]);
  expect(groupTerritoryMarkers(points, Number.NaN, 320)).toEqual([]);
});
