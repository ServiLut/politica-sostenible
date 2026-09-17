import { ApiError, apiRequest, type ApiRequestOptions } from "@/lib/api-client";

export type ElectoralCatalogImportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export interface ElectoralCatalogImportJob {
  id: string;
  tenantId: string;
  clientRequestId: string;
  status: ElectoralCatalogImportStatus;
  catalogKey: string;
  sourceUrl: string;
  sourceDataset: string;
  sourceCutoffAt: string;
  electionDate: string;
  authorizationReference: string;
  licenseDeclaration: string;
  sourceArtifactPath: string;
  expectedContentSha256: string;
  requestedById: string;
  releaseId: string | null;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogImportMetadata {
  catalogKey: string;
  sourceUrl: string;
  sourceDataset: string;
  sourceCutoffAt: string;
  electionDate: string;
  authorizationReference: string;
  licenseDeclaration: string;
}

export interface CreateElectoralCatalogImportInput extends CatalogImportMetadata {
  clientRequestId: string;
  sourceArtifactPath: string;
  expectedContentSha256: string;
}

export interface CreateElectoralCatalogImportResult {
  job: ElectoralCatalogImportJob;
  created: boolean;
  queued: boolean;
}

export interface RetryElectoralCatalogImportResult {
  job: ElectoralCatalogImportJob;
  queued: boolean;
  noOp: boolean;
}

interface CatalogUploadAuthorization {
  bucket: string;
  path: string;
  uploadUrl: string;
  uploadToken: string;
  method: "PUT";
  headers: Record<string, string>;
  metadata: {
    fileName: string;
    contentType: string;
    size: number;
  };
}

interface CatalogUploadConfirmation {
  confirmed: true;
  path: string;
  module?: "electoral-catalog";
}

export interface CatalogImportPreparationDependencies {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  put(file: File, authorization: CatalogUploadAuthorization): Promise<void>;
  sha256(file: File): Promise<string>;
  uuid(): string;
}

const CATALOG_ARTIFACT_PATH =
  /^[A-Za-z0-9_-]{1,128}\/electoral-catalog\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/iu;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

export const ELECTORAL_CATALOG_MAX_BYTES = 25 * 1024 * 1024;
export const ELECTORAL_CATALOG_CONTENT_TYPE = "application/json";
export const RNEC_PUBLIC_PACKAGE_FORMAT = "rnec-public-package.v2";
export type RnecElectionRound = "FIRST_ROUND" | "SECOND_ROUND";
const RNEC_ELECTION_CONTEXTS: Record<
  RnecElectionRound,
  { electionDate: string; departmentsTreeUrl: string; geolocationUrl: string }
> = {
  FIRST_ROUND: {
    electionDate: "2026-05-31",
    departmentsTreeUrl:
      "https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
    geolocationUrl:
      "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json",
  },
  SECOND_ROUND: {
    electionDate: "2026-06-21",
    departmentsTreeUrl:
      "https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
    geolocationUrl:
      "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json",
  },
};

export interface BuildRnecPublicPackageInput {
  departmentsTreeFile: File;
  geolocationFile: File;
  matchingRulesFile?: File | null;
  electionName: string;
  electionDate: string;
  electionRound: RnecElectionRound;
  cutoffAt: string;
  departmentsTreeSourceUrl: string;
  geolocationSourceUrl: string;
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: JsonObject,
  allowed: readonly string[],
  label: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiError(
      `${label} contiene campos no permitidos: ${unknown.join(", ")}.`,
      400,
    );
  }
}

function normalizeRnecSourceUrl(
  value: string,
  label: string,
  kind: "departmentsTree" | "geolocation",
  round: RnecElectionRound,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(`${label} debe ser una URL HTTPS de RNEC.`, 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    url.protocol !== "https:" ||
    (host !== "registraduria.gov.co" && !host.endsWith(".registraduria.gov.co"))
  ) {
    throw new ApiError(`${label} debe pertenecer a registraduria.gov.co.`, 400);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError(`${label} no admite credenciales, query ni fragmento.`, 400);
  }
  const normalized = url.toString();
  const expected =
    kind === "departmentsTree"
      ? RNEC_ELECTION_CONTEXTS[round].departmentsTreeUrl
      : RNEC_ELECTION_CONTEXTS[round].geolocationUrl;
  if (normalized !== expected) {
    throw new ApiError(
      `${label} no corresponde a la fuente oficial conocida para la vuelta seleccionada.`,
      400,
    );
  }
  return normalized;
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 20) {
    throw new ApiError("El payload excede la profundidad segura.", 400);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`,
      )
      .join(",")}}`;
  }
  throw new ApiError("El payload contiene un valor no JSON.", 400);
}

export async function calculateCanonicalPayloadSha256(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readBoundedJson(file: File, label: string): Promise<unknown> {
  validateCatalogFile(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new ApiError(`${label} no contiene JSON válido.`, 400);
  }
  return parsed;
}

function assertOfficialTreeShape(value: unknown): asserts value is JsonObject {
  if (!isJsonObject(value)) {
    throw new ApiError("El archivo departmentsTree debe ser un objeto JSON.", 400);
  }
  assertExactKeys(value, ["data"], "departmentsTree");
  const data = value.data;
  if (!isJsonObject(data)) {
    throw new ApiError("Falta data en departmentsTree.", 400);
  }
  assertExactKeys(data, ["departmentsTree"], "departmentsTree.data");
  const tree = data.departmentsTree;
  if (!isJsonObject(tree)) {
    throw new ApiError("Falta data.departmentsTree.", 400);
  }
  assertExactKeys(tree, ["edges"], "departmentsTree.data.departmentsTree");
  if (!Array.isArray(tree.edges) || tree.edges.length === 0) {
    throw new ApiError("departmentsTree debe contener al menos un departamento.", 400);
  }
}

function assertGeolocationShape(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError("El archivo de geolocalización debe ser un arreglo no vacío.", 400);
  }
  if (value.length > 100_000) {
    throw new ApiError("El archivo de geolocalización excede el límite seguro.", 400);
  }
}

function parseMatchingRules(value: unknown) {
  if (!isJsonObject(value)) {
    throw new ApiError("Las reglas de coincidencia deben ser un objeto JSON.", 400);
  }
  assertExactKeys(
    value,
    ["departmentAliases", "overrides", "coordinateOmissions"],
    "Las reglas",
  );
  const departmentAliases = value.departmentAliases ?? [];
  const overrides = value.overrides ?? [];
  const coordinateOmissions = value.coordinateOmissions ?? [];
  if (
    !Array.isArray(departmentAliases) ||
    !Array.isArray(overrides) ||
    !Array.isArray(coordinateOmissions)
  ) {
    throw new ApiError(
      "departmentAliases, overrides y coordinateOmissions deben ser arreglos.",
      400,
    );
  }
  if (
    departmentAliases.length > 100 ||
    overrides.length > 100_000 ||
    coordinateOmissions.length > 1_000
  ) {
    throw new ApiError("Las reglas de coincidencia exceden los límites seguros.", 400);
  }
  return { departmentAliases, overrides, coordinateOmissions };
}

export async function buildRnecPublicPackageFile(
  input: BuildRnecPublicPackageInput,
): Promise<File> {
  const departmentsTree = await readBoundedJson(
    input.departmentsTreeFile,
    "El archivo departmentsTree",
  );
  const geolocation = await readBoundedJson(
    input.geolocationFile,
    "El archivo de geolocalización",
  );
  assertOfficialTreeShape(departmentsTree);
  assertGeolocationShape(geolocation);
  const [departmentsTreeSha256, geolocationSha256] = await Promise.all([
    calculateFileSha256(input.departmentsTreeFile),
    calculateFileSha256(input.geolocationFile),
  ]);

  const rules = input.matchingRulesFile
    ? parseMatchingRules(
        await readBoundedJson(input.matchingRulesFile, "El archivo de reglas"),
      )
    : { departmentAliases: [], overrides: [], coordinateOmissions: [] };
  const cutoff = new Date(input.cutoffAt);
  if (Number.isNaN(cutoff.getTime()) || cutoff.getTime() > Date.now()) {
    throw new ApiError("La fecha de corte debe ser válida y no futura.", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.electionDate)) {
    throw new ApiError("La fecha electoral debe usar YYYY-MM-DD.", 400);
  }
  const electionContext = RNEC_ELECTION_CONTEXTS[input.electionRound];
  if (!electionContext || electionContext.electionDate !== input.electionDate) {
    throw new ApiError(
      "La fecha electoral no corresponde a la vuelta seleccionada.",
      400,
    );
  }
  const electionName = input.electionName.trim();
  if (electionName.length < 3 || electionName.length > 300) {
    throw new ApiError("El nombre electoral debe tener entre 3 y 300 caracteres.", 400);
  }

  const [treeCanonicalSha256, geoCanonicalSha256] = await Promise.all([
    calculateCanonicalPayloadSha256(departmentsTree),
    calculateCanonicalPayloadSha256(geolocation),
  ]);
  const sourceContext = {
    electionDate: input.electionDate,
    round: input.electionRound,
  };
  const envelope = {
    format: RNEC_PUBLIC_PACKAGE_FORMAT,
    election: {
      name: electionName,
      electionDate: input.electionDate,
      round: input.electionRound,
      cutoffAt: cutoff.toISOString(),
    },
    sources: {
      departmentsTree: {
        sourceUrl: normalizeRnecSourceUrl(
          input.departmentsTreeSourceUrl,
          "La URL de departmentsTree",
          "departmentsTree",
          input.electionRound,
        ),
        sourceContext,
        retrievedAt: cutoff.toISOString(),
        rawContentSha256: departmentsTreeSha256,
        payloadCanonicalSha256: treeCanonicalSha256,
        payload: departmentsTree,
      },
      geolocation: {
        sourceUrl: normalizeRnecSourceUrl(
          input.geolocationSourceUrl,
          "La URL de geolocalización",
          "geolocation",
          input.electionRound,
        ),
        sourceContext,
        retrievedAt: cutoff.toISOString(),
        rawContentSha256: geolocationSha256,
        payloadCanonicalSha256: geoCanonicalSha256,
        payload: geolocation,
      },
    },
    ...(rules.departmentAliases.length > 0
      ? { departmentAliases: rules.departmentAliases }
      : {}),
    ...(rules.overrides.length > 0 ? { overrides: rules.overrides } : {}),
    ...(rules.coordinateOmissions.length > 0
      ? { coordinateOmissions: rules.coordinateOmissions }
      : {}),
  };
  const content = JSON.stringify(envelope);
  if (new Blob([content]).size > ELECTORAL_CATALOG_MAX_BYTES) {
    throw new ApiError("El paquete final excede el máximo de 25 MiB.", 400);
  }
  return new File([content], `rnec-public-package-${input.electionDate}.json`, {
    type: ELECTORAL_CATALOG_CONTENT_TYPE,
  });
}

export function createRnecPublicPackageTemplateFile(): File {
  const content = JSON.stringify(
    {
      format: RNEC_PUBLIC_PACKAGE_FORMAT,
      notice: "PLANTILLA ILUSTRATIVA NO OFICIAL. No contiene datos RNEC.",
      requiredInputs: {
        departmentsTree: "Seleccione localmente el JSON oficial sin modificarlo.",
        geolocation: "Seleccione localmente el arreglo JSON oficial sin modificarlo.",
      },
      electionContext: {
        round: "FIRST_ROUND o SECOND_ROUND",
        electionDate: "2026-05-31 o 2026-06-21, respectivamente",
        notice:
          "Cada fuente queda ligada a la vuelta. El hash de bytes es evidencia declarada; el backend recalcula el hash canónico del payload.",
      },
      optionalMatchingRules: {
        departmentAliases: [{ treeName: "NOMBRE EN ÁRBOL", geolocationName: "NOMBRE EN MAPA" }],
        overrides: [{ stand: "DD/MMM/ZZ/A1", codigo: "CODIGO_GEO_UNICO" }],
        coordinateOmissions: [
          {
            action: "OMIT_COORDINATES",
            codigo: "CODIGO_GEO_UNICO",
            originalLat: 999,
            originalLng: -999,
            justification: "Explique el defecto exacto de la fuente oficial.",
            evidenceReference:
              "https://www.registraduria.gov.co/ruta-publica-de-evidencia",
          },
        ],
      },
    },
    null,
    2,
  );
  return new File([content], "plantilla-paquete-rnec-no-oficial.json", {
    type: ELECTORAL_CATALOG_CONTENT_TYPE,
  });
}

function contentTypeHeader(headers: Record<string, string>) {
  return Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
}

function validateCatalogFile(file: File) {
  const hasAllowedMime =
    file.type === "" || file.type === ELECTORAL_CATALOG_CONTENT_TYPE;
  if (
    file.size < 1 ||
    file.size > ELECTORAL_CATALOG_MAX_BYTES ||
    !hasAllowedMime ||
    !file.name.toLowerCase().endsWith(".json")
  ) {
    throw new ApiError(
      "El artefacto debe ser un JSON no vacío de máximo 25 MiB.",
      400,
    );
  }
}

function validateUploadAuthorization(
  authorization: CatalogUploadAuthorization,
  file: File,
) {
  let url: URL;
  try {
    url = new URL(authorization.uploadUrl);
  } catch {
    throw new ApiError(
      "La API devolvió una autorización de almacenamiento inválida.",
      502,
    );
  }
  const headerNames = Object.keys(authorization.headers).map((name) =>
    name.toLowerCase(),
  );
  const secureUploadUrl =
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname.toLowerCase()));
  if (
    !authorization.bucket?.trim() ||
    !authorization.uploadToken?.trim() ||
    authorization.method !== "PUT" ||
    !secureUploadUrl ||
    !CATALOG_ARTIFACT_PATH.test(authorization.path) ||
    headerNames.length !== 1 ||
    headerNames[0] !== "content-type" ||
    contentTypeHeader(authorization.headers) !==
      ELECTORAL_CATALOG_CONTENT_TYPE ||
    authorization.metadata.fileName !== file.name ||
    authorization.metadata.contentType !== ELECTORAL_CATALOG_CONTENT_TYPE ||
    authorization.metadata.size !== file.size
  ) {
    throw new ApiError(
      "La API devolvió una autorización de almacenamiento inválida.",
      502,
    );
  }
}

export async function calculateFileSha256(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createCatalogClientRequestId(): string {
  const value = globalThis.crypto.randomUUID();
  if (!UUID_V4.test(value)) {
    throw new ApiError(
      "El navegador no pudo crear un identificador seguro para la solicitud.",
      0,
    );
  }
  return value;
}

export async function putCatalogArtifact(
  file: File,
  authorization: CatalogUploadAuthorization,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<void> {
  validateUploadAuthorization(authorization, file);
  let response: Response;
  try {
    response = await fetcher(authorization.uploadUrl, {
      method: authorization.method,
      headers: authorization.headers,
      body: file,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (cause) {
    throw new ApiError(
      "No fue posible enviar el artefacto al almacenamiento privado.",
      0,
      cause,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      "El almacenamiento privado rechazó el artefacto.",
      response.status,
    );
  }
}

const defaultPreparationDependencies: CatalogImportPreparationDependencies = {
  request: apiRequest,
  put: putCatalogArtifact,
  sha256: calculateFileSha256,
  uuid: createCatalogClientRequestId,
};

export async function prepareElectoralCatalogImport(
  file: File,
  metadata: CatalogImportMetadata,
  dependencies: CatalogImportPreparationDependencies = defaultPreparationDependencies,
): Promise<CreateElectoralCatalogImportInput> {
  validateCatalogFile(file);
  const clientRequestId = dependencies.uuid();
  if (!UUID_V4.test(clientRequestId)) {
    throw new ApiError("clientRequestId debe ser un UUID v4.", 400);
  }
  const expectedContentSha256 = await dependencies.sha256(file);
  if (!SHA256.test(expectedContentSha256)) {
    throw new ApiError("No fue posible calcular una huella SHA-256 válida.", 0);
  }

  const authorization = await dependencies.request<CatalogUploadAuthorization>(
    "storage/upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        module: "electoral-catalog",
        fileName: file.name,
        contentType: ELECTORAL_CATALOG_CONTENT_TYPE,
        size: file.size,
      }),
    },
  );
  validateUploadAuthorization(authorization, file);
  await dependencies.put(file, authorization);
  const confirmation = await dependencies.request<CatalogUploadConfirmation>(
    "storage/complete",
    {
      method: "POST",
      body: JSON.stringify({
        module: "electoral-catalog",
        path: authorization.path,
        metadata: authorization.metadata,
      }),
    },
  );
  if (
    confirmation.confirmed !== true ||
    confirmation.path !== authorization.path ||
    (confirmation.module !== undefined &&
      confirmation.module !== "electoral-catalog")
  ) {
    throw new ApiError(
      "La API devolvió una confirmación de almacenamiento inválida.",
      502,
    );
  }

  return {
    clientRequestId,
    ...metadata,
    sourceArtifactPath: confirmation.path,
    expectedContentSha256,
  };
}

export function createElectoralCatalogImport(
  input: CreateElectoralCatalogImportInput,
): Promise<CreateElectoralCatalogImportResult> {
  return apiRequest("electoral-catalog/imports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listElectoralCatalogImports(
  options: { status?: ElectoralCatalogImportStatus; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ElectoralCatalogImportJob[]> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 25) });
  if (options.status) query.set("status", options.status);
  return apiRequest(`electoral-catalog/imports?${query}`, { signal });
}

export function getElectoralCatalogImport(
  importJobId: string,
  signal?: AbortSignal,
): Promise<ElectoralCatalogImportJob> {
  return apiRequest(
    `electoral-catalog/imports/${encodeURIComponent(importJobId)}`,
    { signal },
  );
}

export function retryElectoralCatalogImport(
  importJobId: string,
): Promise<RetryElectoralCatalogImportResult> {
  return apiRequest(
    `electoral-catalog/imports/${encodeURIComponent(importJobId)}/retry`,
    { method: "POST" },
  );
}

export function isPendingCatalogImport(
  status: ElectoralCatalogImportStatus,
): boolean {
  return status === "QUEUED" || status === "PROCESSING";
}
