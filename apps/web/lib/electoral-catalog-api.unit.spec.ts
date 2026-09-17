import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import {
  activateCatalogRelease,
  catalogErrorMessage,
  diffCatalogRelease,
  getCatalogRelease,
  listCatalogReleases,
  validateCatalogRelease,
} from "./electoral-catalog-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("lista releases con filtros permitidos y límite acotado", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (request) => {
    requestedUrl = String(request);
    return successful([]);
  };

  try {
    await listCatalogReleases({
      type: "ELECTORAL_RNEC",
      status: "VALIDATED",
      limit: 100,
    });
    expect(requestedUrl).toBe(
      "/api/electoral-catalog/releases?type=ELECTORAL_RNEC&status=VALIDATED&limit=100",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pagina entradas mediante cursor sin alterar el identificador del release", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (request) => {
    requestedUrl = String(request);
    return successful({ release: {}, entries: [], pagination: {} });
  };

  try {
    await getCatalogRelease("release seguro", {
      entryLimit: 100,
      entryCursorId: "entry_2",
    });
    expect(requestedUrl).toBe(
      "/api/electoral-catalog/releases/release%20seguro?entryLimit=100&entryCursorId=entry_2",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("el diff explícito conserva la versión base seleccionada", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (request) => {
    requestedUrl = String(request);
    return successful({});
  };

  try {
    await diffCatalogRelease("release_target", "release_base");
    expect(requestedUrl).toBe(
      "/api/electoral-catalog/releases/release_target/diff?againstReleaseId=release_base",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validar y activar solo envían la huella, nunca tenant ni actor", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (request, init) => {
    calls.push({ url: String(request), init });
    return successful({ noOp: false });
  };
  const sha256 = "a".repeat(64);

  try {
    await validateCatalogRelease("release_1", sha256);
    await activateCatalogRelease("release_1", sha256);

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/electoral-catalog/releases/release_1/validate",
      "/api/electoral-catalog/releases/release_1/activate",
    ]);
    for (const { init } of calls) {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        expectedContentSha256: sha256,
      });
      expect(String(init?.body)).not.toContain("tenantId");
      expect(String(init?.body)).not.toContain("approvedById");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("distingue solicitudes inválidas, permisos y conflictos operativos", () => {
  expect(catalogErrorMessage(new ApiError("hash inválido", 400))).toContain(
    "Solicitud inválida. hash inválido",
  );
  expect(catalogErrorMessage(new ApiError("rol vencido", 403))).toContain(
    "Acceso denegado. rol vencido",
  );
  expect(
    catalogErrorMessage(new ApiError("requiere segunda persona", 409)),
  ).toContain(
    "El catálogo cambió o no cumple los controles. requiere segunda persona",
  );
});
