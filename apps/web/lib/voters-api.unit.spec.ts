import { expect, test } from "@playwright/test";
import {
  createVoter,
  grantVoterConsent,
  getVoterCaptureContext,
  listVoters,
  syncOfflineVoter,
} from "./voters-api";

function successfulPage() {
  return new Response(
    JSON.stringify({
      statusCode: 200,
      message: "Success",
      data: {
        items: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("envia documentos y celulares de busqueda solo en un body POST", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return successfulPage();
  };

  try {
    await listVoters(1, 25, "  +57 (300) 123-4567  ");

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/voters/search");
    expect(requests[0].url.search).toBe("");
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      page: 1,
      limit: 25,
      search: "+57 (300) 123-4567",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usa GET exclusivamente para paginacion cuando no hay termino", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return successfulPage();
  };

  try {
    await listVoters(2, 10, "   ");

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/voters");
    expect(requests[0].url.searchParams.get("page")).toBe("2");
    expect(requests[0].url.searchParams.get("limit")).toBe("10");
    expect(requests[0].url.searchParams.has("search")).toBe(false);
    expect(requests[0].init?.method).toBeUndefined();
    expect(requests[0].init?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filtra un deep-link por id sin enviar tenant, mode ni datos personales", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return successfulPage();
  };

  try {
    await listVoters(1, 25, undefined, undefined, "voter-a");

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/voters");
    expect(requests[0].url.searchParams.get("entityId")).toBe("voter-a");
    expect(requests[0].url.searchParams.has("tenantId")).toBe(false);
    expect(requests[0].url.searchParams.has("mode")).toBe(false);
    expect(requests[0].init?.method).toBeUndefined();
    expect(requests[0].init?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("consulta el alcance de captura sin aceptar territorio del cliente", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return new Response(
      JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: {
          puestos: [{ id: "puesto-a", code: "P-01", name: "Colegio Central" }],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await expect(getVoterCaptureContext()).resolves.toEqual({
      puestos: [{ id: "puesto-a", code: "P-01", name: "Colegio Central" }],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/voters/capture-context");
    expect(requests[0].url.search).toBe("");
    expect(requests[0].init?.method).toBeUndefined();
    expect(requests[0].init?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("envia el puesto permitido en la captura y nunca un tenant elegido por la UI", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return new Response(
      JSON.stringify({
        statusCode: 201,
        message: "Success",
        data: { received: true },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await createVoter({
      documentId: "1012345678",
      firstName: "María",
      lastName: "Pérez",
      puestoId: "puesto-a",
      consentAccepted: true,
      termsVersion: "2026.1",
      collectionChannel: "IN_PERSON",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/voters");
    expect(requests[0].init?.method).toBe("POST");
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toMatchObject({
      documentId: "1012345678",
      puestoId: "puesto-a",
      consentAccepted: true,
    });
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("registrarId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reauthoriza mediante un endpoint explicito sin aceptar tenant ni actor del cliente", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return new Response(
      JSON.stringify({
        statusCode: 201,
        message: "Success",
        data: {
          voterId: "voter/with spaces",
          consentAccepted: true,
          status: "GRANTED",
          grantedAt: "2026-09-04T14:30:00.000Z",
          noticeVersion: "2026.1",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await grantVoterConsent("voter/with spaces", {
      noticeVersion: "2026.1",
      collectionChannel: "PHONE",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe(
      "/api/voters/voter%2Fwith%20spaces/consents/grant",
    );
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      consentAccepted: true,
      termsVersion: "2026.1",
      collectionChannel: "PHONE",
    });
    expect(requests[0].init?.body).not.toContain("tenantId");
    expect(requests[0].init?.body).not.toContain("capturedById");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sincroniza voter con id/hora del cliente, no-store y señal cancelable", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const abortController = new AbortController();
  const operationId = "00000000-0000-4000-8000-000000000042";
  const capturedAt = "2026-09-09T14:58:00.000Z";
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input), "http://localhost"), init });
    return new Response(
      JSON.stringify({
        statusCode: 201,
        message: "Success",
        data: {
          received: true,
          receiptId: "receipt-42",
          clientOperationId: operationId,
          operationType: "VOTER_CAPTURE",
          status: "APPLIED",
          capturedAt,
          receivedAt: "2026-09-09T15:00:00.000Z",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await expect(
      syncOfflineVoter(
        {
          clientOperationId: operationId,
          capturedAt,
          documentId: "1012345678",
          firstName: "María",
          lastName: "Pérez",
          puestoId: "puesto-a",
          mesa: 9,
          consentAccepted: true,
          termsVersion: "2026.1",
          collectionChannel: "IN_PERSON",
        },
        abortController.signal,
      ),
    ).resolves.toMatchObject({ clientOperationId: operationId });

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/api/logistics/sync/voter");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.cache).toBe("no-store");
    expect(requests[0].init?.signal).toBe(abortController.signal);
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toMatchObject({ clientOperationId: operationId, capturedAt });
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("accessToken");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
