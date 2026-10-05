import { expect, test } from "@playwright/test";
import type { VotingPlace } from "./election-api";
import {
  changeInventoryPlaceSearch,
  inventoryPlaceOptions,
  loadInventoryVotingPlaces,
} from "./inventory-voting-places";

test("the polling-place selector queries a bounded real API page and forwards cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; signal: RequestInit["signal"] }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), signal: init?.signal });
    return new Response(
      JSON.stringify({
        statusCode: 200,
        data: {
          items: [],
          pagination: { page: 3, totalPages: 8, limit: 20, total: 141 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const controller = new AbortController();
    const result = await loadInventoryVotingPlaces(
      { search: " 05001 ", page: 3 },
      controller.signal,
    );
    const url = new URL(calls[0]!.url, "http://localhost");
    expect(url.pathname).toBe("/api/campaigns/divisions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: "PUESTO",
      page: "3",
      limit: "20",
      search: "05001",
    });
    expect(calls[0]!.signal).toBe(controller.signal);
    expect(result.pagination.total).toBe(141);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("every new search starts on page one", () => {
  expect(changeInventoryPlaceSearch(" Bello ")).toEqual({
    search: "Bello",
    page: 1,
  });
});
test("selection outside the current page retains its code and label without a second team-wide download", () => {
  const selected = {
    id: "outside",
    code: "05001-P200",
    name: "Puesto conservado",
  } as VotingPlace;
  const items = Array.from(
    { length: 20 },
    (_, index) =>
      ({ id: String(index), code: "P" + index, name: "Puesto" }) as VotingPlace,
  );
  const options = inventoryPlaceOptions(items, selected);
  expect(options).toHaveLength(21);
  expect(options[0]).toBe(selected);
  expect(inventoryPlaceOptions([], selected)).toEqual([selected]);
  expect(inventoryPlaceOptions([selected, ...items], selected)).toHaveLength(
    21,
  );
  expect(items).toHaveLength(20);
});
