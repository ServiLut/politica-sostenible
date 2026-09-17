import { expect, test } from "@playwright/test";
import {
  generatePostElectionHandover,
  getPostElectionHandover,
  listPostElectionHandovers,
} from "./transition-handover-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("uses only authenticated HTTP routes and never sends tenant scope", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const controller = new AbortController();
  globalThis.fetch = async (request, init) => {
    calls.push({ url: String(request), init });
    return successful({ items: [], pagination: {} });
  };

  try {
    await listPostElectionHandovers(2, 25, controller.signal);
    await getPostElectionHandover("report/id", controller.signal);
    await generatePostElectionHandover();

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/transition-handover/reports?page=2&limit=25",
      "/api/transition-handover/reports/report%2Fid",
      "/api/transition-handover/report",
    ]);
    expect(calls[0]?.init?.signal).toBe(controller.signal);
    expect(calls[1]?.init?.signal).toBe(controller.signal);
    expect(calls[2]?.init?.method).toBe("POST");
    expect(calls[2]?.init?.body).toBeUndefined();
    expect(calls.every(({ url }) => !url.includes("tenant"))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
