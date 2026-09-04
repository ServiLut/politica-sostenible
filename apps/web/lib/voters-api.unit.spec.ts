import { expect, test } from "@playwright/test";
import {
  createVoter,
  getVoterCaptureContext,
  listVoters,
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
          puestos: [
            { id: "puesto-a", code: "P-01", name: "Colegio Central" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await expect(getVoterCaptureContext()).resolves.toEqual({
      puestos: [
        { id: "puesto-a", code: "P-01", name: "Colegio Central" },
      ],
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
