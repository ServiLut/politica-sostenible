import { expect, test } from "@playwright/test";
import {
  authorizeOfflineE14Evidence,
  confirmOfflineE14Evidence,
  provisionOfflineE14Grant,
  revokeOfflineE14Grants,
  syncOfflineE14,
} from "./offline-e14-api";

function apiResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ statusCode: status, message: "Success", data }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

test("provisions and revokes the opaque grant without client tenant, stage or context", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return requests.length === 1
      ? apiResponse({
          schemaVersion: 3,
          captureGrant: "G".repeat(43),
          captureContext: "SIMULATION",
          issuedAt: "2026-09-09T14:00:00.000Z",
          expiresAt: "2026-09-10T02:00:00.000Z",
          electionDate: "2026-09-20",
          votingStartDate: "2026-09-20",
          votingEndDate: "2026-09-20",
          electionWindowSha256: "e".repeat(64),
          places: [],
        })
      : apiResponse({ revoked: 1 });
  };

  try {
    await provisionOfflineE14Grant();
    await revokeOfflineE14Grants();
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/api/witnesses/offline-capture-grants",
      "/api/witnesses/offline-capture-grants",
    ]);
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[1].init?.method).toBe("DELETE");
    for (const request of requests) {
      expect(request.url.search).toBe("");
      expect(request.init?.body).toBeUndefined();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authorizes E-14 with exact hash metadata and never sends bytes through Nest", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const sha256 = "a".repeat(64);
  const file = new File(["%PDF-1.7\nprivate"], "e14-safe.pdf", {
    type: "application/pdf",
  });
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return apiResponse({
      bucket: "private-evidence",
      path: "tenant-a/e14/22222222-2222-4222-8222-222222222222.pdf",
      uploadUrl: "https://storage.example.test/signed",
      uploadToken: "ephemeral-token",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      metadata: {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        contentSha256: sha256,
      },
    });
  };

  try {
    await authorizeOfflineE14Evidence(file, sha256);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/storage/upload-url");
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toEqual({
      module: "e14",
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      contentSha256: sha256,
    });
    expect(String(requests[0].init?.body)).not.toContain("%PDF");
    expect(requests[0].init?.body).not.toBeInstanceOf(FormData);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirms only the durable path and metadata, never the signed URL or upload token", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const path = "tenant-a/e14/22222222-2222-4222-8222-222222222222.pdf";
  const metadata = {
    fileName: "e14-operation.pdf",
    contentType: "application/pdf",
    size: 100,
    contentSha256: "b".repeat(64),
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return apiResponse({ confirmed: true, path, module: "e14" });
  };

  try {
    await confirmOfflineE14Evidence(path, metadata);
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toEqual({ module: "e14", path, metadata });
    expect(body).not.toHaveProperty("uploadUrl");
    expect(body).not.toHaveProperty("uploadToken");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncs the exact idempotent envelope without tenant or client captureContext", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const operationId = "11111111-1111-4111-8111-111111111111";
  const capturedAt = "2026-09-09T14:58:00.000Z";
  const input = {
    puestoId: "puesto-a",
    mesa: 7,
    credentialType: "E15" as const,
    credentialReference: "E15-BOG-7",
    checkedInAt: "2026-09-09T14:55:00.000Z",
    e14FormType: "DELEGADOS" as const,
    candidateVotes: 80,
    blankVotes: 5,
    nullVotes: 3,
    unmarkedVotes: 2,
    totalTableVotes: 200,
    hasWrittenClaim: false,
    e14ImageUrl: "tenant-a/e14/22222222-2222-4222-8222-222222222222.pdf",
    clientOperationId: operationId,
    capturedAt,
    captureGrant: "G".repeat(43),
    evidenceSha256: "c".repeat(64),
  };
  globalThis.fetch = async (request, init) => {
    requests.push({ url: new URL(String(request), "http://localhost"), init });
    return apiResponse({
      received: true,
      receiptId: "receipt-a",
      clientOperationId: operationId,
      operationType: "E14_REPORT",
      status: "APPLIED",
      capturedAt,
      receivedAt: "2026-09-09T15:00:00.000Z",
      captureContext: "SIMULATION",
    });
  };

  try {
    await syncOfflineE14(input);
    expect(requests[0].url.pathname).toBe("/api/logistics/sync/e14");
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toEqual(input);
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("actorUserId");
    expect(body).not.toHaveProperty("captureContext");
    expect(requests[0].init?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
