import { expect, test } from "@playwright/test";
import {
  executeVoterImport,
  getVoterImportTemplate,
  previewVoterImport,
} from "./import-api";

test("usa los endpoints de personas sin aceptar tenant ni modo desde el cliente", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    requests.push({ url, init });
    if (url.pathname.endsWith("/template")) {
      return new Response("Documento,Ruta evidencia", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      });
    }
    return new Response(
      JSON.stringify({
        statusCode: 200,
        data: url.pathname.endsWith("/preview")
          ? {
              totalRows: 0,
              validRows: 0,
              errorRows: [],
              duplicatesInFile: 0,
              duplicatesInDatabase: 0,
              preview: [],
            }
          : { success: true, imported: 0, skipped: 0 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const csv = "Documento,Ruta evidencia\n1012345678,path.pdf";
    await expect(getVoterImportTemplate()).resolves.toBeInstanceOf(Blob);
    await previewVoterImport(csv);
    await executeVoterImport(csv);

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/api/import/personas/template",
      "/api/import/personas/preview",
      "/api/import/personas/execute",
    ]);
    expect(requests.every(({ url }) => url.search === "")).toBe(true);
    expect(requests[0].init?.body).toBeUndefined();
    expect(requests.slice(1).map(({ init }) => init?.method)).toEqual([
      "POST",
      "POST",
    ]);
    for (const { init } of requests.slice(1)) {
      expect(JSON.parse(String(init?.body))).toEqual({ csv });
      expect(String(init?.body)).not.toContain("tenantId");
      expect(String(init?.body)).not.toContain('"mode"');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
