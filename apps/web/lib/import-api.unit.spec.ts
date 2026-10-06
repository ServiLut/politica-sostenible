import { expect, test } from "@playwright/test";
import {
  executeVoterImport,
  createVoterImportJob,
  downloadVoterImportErrors,
  executeVoterImportJob,
  getVoterImportJob,
  getVoterImportJobErrors,
  getVoterImportOptions,
  getVoterImportTemplate,
  previewVoterImport,
  listVoterImportJobs,
  retryVoterImportJob,
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

test("trabajos masivos transmiten sólo referencia firmada y hash; lecturas son paginadas y cancelables", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    requests.push({ url, init });
    return new Response(
      url.pathname.endsWith("errors.csv")
        ? "Documento;Fila;Motivo\n"
        : JSON.stringify({ statusCode: 200, data: {} }),
      {
        status: 200,
        headers: {
          "Content-Type": url.pathname.endsWith("errors.csv")
            ? "text/csv"
            : "application/json",
        },
      },
    );
  };
  const signal = new AbortController().signal;
  const input = {
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    sourceArtifactPath: "tenant/person-import/source.csv",
    expectedContentSha256: "a".repeat(64),
    fileName: "personas.csv",
    tenantId: "must-not-pass",
    csv: "must-not-pass",
  };
  try {
    await getVoterImportOptions(signal);
    await listVoterImportJobs(3, signal);
    await createVoterImportJob(input);
    await createVoterImportJob(input);
    await getVoterImportJob("job/1", signal);
    await getVoterImportJobErrors("job/1", 2, signal);
    await executeVoterImportJob("job/1");
    await retryVoterImportJob("job/1");
    await expect(downloadVoterImportErrors("job/1")).resolves.toBeInstanceOf(
      Blob,
    );
    expect(requests.map(({ url }) => url.pathname + url.search)).toEqual([
      "/api/import/personas/options",
      "/api/import/personas/jobs?page=3&limit=10",
      "/api/import/personas/jobs",
      "/api/import/personas/jobs",
      "/api/import/personas/jobs/job%2F1",
      "/api/import/personas/jobs/job%2F1/errors?page=2&limit=20",
      "/api/import/personas/jobs/job%2F1/execute",
      "/api/import/personas/jobs/job%2F1/retry",
      "/api/import/personas/jobs/job%2F1/errors.csv",
    ]);
    expect(JSON.parse(String(requests[2].init?.body))).toEqual({
      clientRequestId: input.clientRequestId,
      sourceArtifactPath: input.sourceArtifactPath,
      expectedContentSha256: input.expectedContentSha256,
      fileName: input.fileName,
    });
    expect(requests[2].init?.body).toBe(requests[3].init?.body);
    for (const index of [0, 1, 4, 5])
      expect(requests[index].init?.signal).toBe(signal);
    for (const index of [6, 7]) {
      expect(requests[index].init?.method).toBe("POST");
      expect(requests[index].init?.body).toBeUndefined();
    }
  } finally {
    globalThis.fetch = original;
  }
});
