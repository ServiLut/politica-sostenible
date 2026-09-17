import { expect, test } from "@playwright/test";
import type { ApiRequestOptions } from "./api-client";
import {
  buildRnecPublicPackageFile,
  calculateFileSha256,
  createElectoralCatalogImport,
  getElectoralCatalogImport,
  isPendingCatalogImport,
  listElectoralCatalogImports,
  prepareElectoralCatalogImport,
  putCatalogArtifact,
  RNEC_PUBLIC_PACKAGE_FORMAT,
  retryElectoralCatalogImport,
  type CatalogImportMetadata,
  type CatalogImportPreparationDependencies,
} from "./electoral-catalog-import-api";

const officialTreeFixture = {
  data: {
    departmentsTree: {
      edges: [
        {
          node: {
            idDepartmentCode: "11",
            departmentName: "BOGOTA D.C.",
            municipalities: [],
          },
        },
      ],
    },
  },
};
const geolocationFixture = [
  {
    codigo: "110010101",
    departamento: "BOGOTA D.C.",
    municipio: "BOGOTA D.C.",
    puesto: "PUESTO DE EJEMPLO",
    comuna: "01",
    direccion: "DIRECCION DECLARADA",
    lat: 4.6,
    lng: -74.1,
  },
];

const PATH =
  "tenant-a/electoral-catalog/7c8f80d8-66c5-4f3a-9745-b66219c13f74.json";
const CLIENT_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const SHA256 = "a".repeat(64);
const metadata: CatalogImportMetadata = {
  catalogKey: "PRESIDENCIA_2026",
  sourceUrl: "https://www.registraduria.gov.co/fuente.json",
  sourceDataset: "DIVIPOLE Presidencia 2026",
  sourceCutoffAt: "2026-05-01T15:00:00.000Z",
  electionDate: "2026-05-31",
  authorizationReference: "RNEC-AUT-001",
  licenseDeclaration: "Uso interno autorizado",
};

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("calcula SHA-256 del archivo dentro del navegador", async () => {
  const file = new File(["hello"], "catalog.json", {
    type: "application/json",
  });

  await expect(calculateFileSha256(file)).resolves.toBe(
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

test("construye localmente el envelope RNEC versionado sin alterar los payloads", async () => {
  const treeFile = new File(
    [JSON.stringify(officialTreeFixture)],
    "departmentsTree.json",
    { type: "" },
  );
  const geoFile = new File(
    [JSON.stringify(geolocationFixture)],
    "data.json",
    { type: "application/json" },
  );
  const rulesFile = new File(
    [
      JSON.stringify({
        departmentAliases: [
          {
            treeName: "NORTE DE SAN",
            geolocationName: "NORTE DE SANTANDER",
          },
        ],
        overrides: [{ stand: "11/001/01/A1", codigo: "110010101" }],
        coordinateOmissions: [
          {
            action: "OMIT_COORDINATES",
            codigo: "110010101",
            originalLat: 999,
            originalLng: -74.1,
            justification: "Defecto de coordenada declarado para revisión.",
            evidenceReference:
              "https://www.registraduria.gov.co/evidencia-publica",
          },
        ],
      }),
    ],
    "reglas.json",
    { type: "application/json" },
  );

  const result = await buildRnecPublicPackageFile({
    departmentsTreeFile: treeFile,
    geolocationFile: geoFile,
    matchingRulesFile: rulesFile,
    electionName: "Presidencia 2026",
    electionDate: "2026-05-31",
    electionRound: "FIRST_ROUND",
    cutoffAt: "2026-05-01T15:00:00.000Z",
    departmentsTreeSourceUrl:
      "https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
    geolocationSourceUrl:
      "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json",
  });
  const envelope = JSON.parse(await result.text());

  expect(result.name).toBe("rnec-public-package-2026-05-31.json");
  expect(result.type).toBe("application/json");
  expect(envelope.format).toBe(RNEC_PUBLIC_PACKAGE_FORMAT);
  expect(envelope.sources.departmentsTree.payload).toEqual(officialTreeFixture);
  expect(envelope.sources.geolocation.payload).toEqual(geolocationFixture);
  expect(envelope.sources.departmentsTree.rawContentSha256).toMatch(
    /^[a-f0-9]{64}$/u,
  );
  expect(envelope.sources.geolocation.rawContentSha256).toMatch(
    /^[a-f0-9]{64}$/u,
  );
  expect(envelope.sources.departmentsTree.payloadCanonicalSha256).toMatch(
    /^[a-f0-9]{64}$/u,
  );
  expect(envelope.sources.geolocation.payloadCanonicalSha256).toMatch(
    /^[a-f0-9]{64}$/u,
  );
  expect(envelope.sources.departmentsTree.sourceContext).toEqual({
    electionDate: "2026-05-31",
    round: "FIRST_ROUND",
  });
  expect(envelope.overrides).toEqual([
    { stand: "11/001/01/A1", codigo: "110010101" },
  ]);
  expect(envelope.coordinateOmissions).toEqual([
    expect.objectContaining({
      action: "OMIT_COORDINATES",
      codigo: "110010101",
      originalLat: 999,
    }),
  ]);
});

test("rechaza paquetes locales mal tipados, fuentes ajenas y reglas desconocidas", async () => {
  const validTree = new File(
    [JSON.stringify(officialTreeFixture)],
    "departmentsTree.json",
    { type: "application/json" },
  );
  const validGeo = new File(
    [JSON.stringify(geolocationFixture)],
    "data.json",
    { type: "application/json" },
  );
  const base = {
    departmentsTreeFile: validTree,
    geolocationFile: validGeo,
    electionName: "Presidencia 2026",
    electionDate: "2026-05-31",
    electionRound: "FIRST_ROUND" as const,
    cutoffAt: "2026-05-01T15:00:00.000Z",
    departmentsTreeSourceUrl:
      "https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
    geolocationSourceUrl:
      "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json",
  };

  await expect(
    buildRnecPublicPackageFile({
      ...base,
      departmentsTreeFile: new File(["{}"], "tree.json", {
        type: "text/plain",
      }),
    }),
  ).rejects.toThrow("JSON no vacío de máximo 25 MiB");
  await expect(
    buildRnecPublicPackageFile({
      ...base,
      geolocationSourceUrl: "https://example.test/data.json",
    }),
  ).rejects.toThrow("debe pertenecer a registraduria.gov.co");
  await expect(
    buildRnecPublicPackageFile({
      ...base,
      electionRound: "SECOND_ROUND",
    }),
  ).rejects.toThrow("fecha electoral no corresponde");
  await expect(
    buildRnecPublicPackageFile({
      ...base,
      matchingRulesFile: new File(
        [JSON.stringify({ overrides: [], automaticCorrections: true })],
        "reglas.json",
        { type: "application/json" },
      ),
    }),
  ).rejects.toThrow("campos no permitidos");
});

test("autoriza, sube directo, confirma y construye el DTO sin binarios ni tenant", async () => {
  const file = new File(["{}"], "catalog.json", {
    type: "application/json",
  });
  const authorization = {
    bucket: "private-files",
    path: PATH,
    uploadUrl: "https://storage.example.test/signed/catalog",
    uploadToken: "signed-token-not-persisted",
    method: "PUT" as const,
    headers: { "Content-Type": "application/json" },
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
  };
  const requests: Array<{ path: string; options?: ApiRequestOptions }> = [];
  const uploads: File[] = [];
  const dependencies: CatalogImportPreparationDependencies = {
    request: async <T>(path: string, options?: ApiRequestOptions) => {
      requests.push({ path, options });
      return (
        path === "storage/upload-url"
          ? authorization
          : { confirmed: true, path: PATH, module: "electoral-catalog" }
      ) as T;
    },
    put: async (uploadedFile) => {
      uploads.push(uploadedFile);
    },
    sha256: async () => SHA256,
    uuid: () => CLIENT_REQUEST_ID,
  };

  const result = await prepareElectoralCatalogImport(
    file,
    metadata,
    dependencies,
  );

  expect(uploads).toEqual([file]);
  expect(requests.map(({ path }) => path)).toEqual([
    "storage/upload-url",
    "storage/complete",
  ]);
  expect(JSON.parse(String(requests[0].options?.body))).toEqual({
    module: "electoral-catalog",
    fileName: "catalog.json",
    contentType: "application/json",
    size: 2,
  });
  expect(JSON.parse(String(requests[1].options?.body))).toEqual({
    module: "electoral-catalog",
    path: PATH,
    metadata: authorization.metadata,
  });
  expect(result).toEqual({
    clientRequestId: CLIENT_REQUEST_ID,
    ...metadata,
    sourceArtifactPath: PATH,
    expectedContentSha256: SHA256,
  });
  expect(
    requests.every(({ options }) => typeof options?.body === "string"),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain("uploadUrl");
  expect(JSON.stringify(result)).not.toContain("uploadToken");
  expect(result).not.toHaveProperty("tenantId");
});

test("normaliza a application/json cuando el navegador deja vacío el MIME del .json", async () => {
  const file = new File(["{}"], "catalog.JSON", { type: "" });
  const requests: Array<{ path: string; options?: ApiRequestOptions }> = [];
  const authorization = {
    bucket: "private-files",
    path: PATH,
    uploadUrl: "https://storage.example.test/signed/catalog",
    uploadToken: "signed-token-not-persisted",
    method: "PUT" as const,
    headers: { "Content-Type": "application/json" },
    metadata: {
      fileName: file.name,
      contentType: "application/json",
      size: file.size,
    },
  };

  await prepareElectoralCatalogImport(file, metadata, {
    request: async <T>(path: string, options?: ApiRequestOptions) => {
      requests.push({ path, options });
      return (path === "storage/upload-url"
        ? authorization
        : { confirmed: true, path: PATH, module: "electoral-catalog" }) as T;
    },
    put: async (uploaded, signed) => {
      expect(uploaded.type).toBe("");
      expect(signed.headers).toEqual({ "Content-Type": "application/json" });
    },
    sha256: async () => SHA256,
    uuid: () => CLIENT_REQUEST_ID,
  });

  expect(JSON.parse(String(requests[0].options?.body))).toMatchObject({
    fileName: "catalog.JSON",
    contentType: "application/json",
  });
});

test("PUT usa exclusivamente la URL y cabeceras firmadas sin credenciales", async () => {
  const file = new File(["{}"], "catalog.json", {
    type: "application/json",
  });
  const authorization = {
    bucket: "private-files",
    path: PATH,
    uploadUrl: "https://storage.example.test/signed/catalog",
    uploadToken: "signed-token",
    method: "PUT" as const,
    headers: { "Content-Type": "application/json" },
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
  };
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  await putCatalogArtifact(file, authorization, async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(null, { status: 200 });
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].input).toBe(authorization.uploadUrl);
  expect(calls[0].init).toMatchObject({
    method: "PUT",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: file,
  });
  expect(calls[0].init?.headers).toEqual({
    "Content-Type": "application/json",
  });
});

test("rechaza localmente archivos fuera del contrato antes de pedir una URL", async () => {
  let requestCalls = 0;
  const dependencies: CatalogImportPreparationDependencies = {
    request: async <T>() => {
      requestCalls += 1;
      return {} as T;
    },
    put: async () => undefined,
    sha256: async () => SHA256,
    uuid: () => CLIENT_REQUEST_ID,
  };

  await expect(
    prepareElectoralCatalogImport(
      new File(["texto"], "catalog.txt", { type: "text/plain" }),
      metadata,
      dependencies,
    ),
  ).rejects.toThrow("JSON no vacío de máximo 25 MiB");
  await expect(
    prepareElectoralCatalogImport(
      new File(["{}"], "catalog.json", { type: "text/plain" }),
      metadata,
      dependencies,
    ),
  ).rejects.toThrow("JSON no vacío de máximo 25 MiB");
  expect(requestCalls).toBe(0);
});

test("creación, consulta, listado y reintento respetan los endpoints durables", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (request, init) => {
    calls.push({ url: String(request), init });
    return successful({});
  };
  const input = {
    clientRequestId: CLIENT_REQUEST_ID,
    ...metadata,
    sourceArtifactPath: PATH,
    expectedContentSha256: SHA256,
  };

  try {
    await createElectoralCatalogImport(input);
    await listElectoralCatalogImports({ status: "FAILED", limit: 50 });
    await getElectoralCatalogImport("job seguro");
    await retryElectoralCatalogImport("job seguro");

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/electoral-catalog/imports",
      "/api/electoral-catalog/imports?limit=50&status=FAILED",
      "/api/electoral-catalog/imports/job%20seguro",
      "/api/electoral-catalog/imports/job%20seguro/retry",
    ]);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(input);
    expect(calls[3].init?.method).toBe("POST");
    expect(calls[3].init?.body).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("solo QUEUED y PROCESSING mantienen seguimiento automático", () => {
  expect(isPendingCatalogImport("QUEUED")).toBe(true);
  expect(isPendingCatalogImport("PROCESSING")).toBe(true);
  expect(isPendingCatalogImport("SUCCEEDED")).toBe(false);
  expect(isPendingCatalogImport("FAILED")).toBe(false);
});
