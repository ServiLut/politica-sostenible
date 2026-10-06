import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import type { AuditEvent } from "@/lib/audit-events-api";
import type { ElectoralCatalogRelease, ElectoralCatalogType, ElectoralCatalogStatus } from "@/lib/electoral-catalog-api";

// Render the real presentation with explicit request/auth fixtures. No HTTP,
// database, authorization decision or mutation is exercised by these SSR tests.
const webRoot = resolve(__dirname, "../..");
const noOp = () => undefined;

function renderPage(path: string, responses: unknown[], namedExport = "default", role = "ADMIN") {
  let requests = 0;
  const cache = new Map<string, unknown>();
  const mocks: Record<string, unknown> = {
    "@/lib/use-page-request": { usePageRequest: () => ({ data: responses[requests++], loading: false, error: null, refresh: noOp, setData: noOp }) },
    "@/context/auth": { useAuth: () => ({ user: { id: "reviewer", backendRole: role }, tenant: { type: "CANDIDACY", operationStage: "CAMPAIGN" } }) },
    "@/lib/electoral-catalog-api": {},
    "@/lib/audit-events-api": {},
    "@/lib/electronic-signature-api": {},
    "@/config/navigation": { getRoleLabel: () => "Administración" },
    "@/components/electoral-catalog/ElectoralCatalogImportPanel": { ElectoralCatalogImportPanel: () => createElement("div", null, "FORMULARIO_AVANZADO") },
  };
  function load(filename: string): Record<string, unknown> {
    if (cache.has(filename)) return cache.get(filename) as Record<string, unknown>;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const componentModule = { exports: {} as Record<string, unknown> };
    cache.set(filename, componentModule.exports);
    const realRequire = createRequire(filename);
    const scopedRequire = (name: string): unknown => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve(webRoot, name.slice(2)) : resolve(dirname(filename), name);
        const candidate = [base + ".tsx", base + ".ts", resolve(base, "index.tsx"), resolve(base, "index.ts")].find(existsSync);
        if (candidate) return load(candidate);
      }
      return realRequire(name);
    };
    runInNewContext(`(function(require, module, exports) { ${compiled}\n})`)(scopedRequire, componentModule, componentModule.exports);
    return componentModule.exports;
  }
  const component = load(resolve(webRoot, path))[namedExport] as ComponentType;
  return renderToStaticMarkup(createElement(component));
}

function release(type: ElectoralCatalogType, status: ElectoralCatalogStatus): ElectoralCatalogRelease {
  return {
    id: "release-qa", tenantId: "tenant-qa", catalogKey: "SIMULATION", type, status,
    sourceUrl: "https://example.invalid/catalog", sourceOrganization: "FUENTE DE PRUEBA",
    sourceDataset: "CATÁLOGO SINTÉTICO", sourceCutoffAt: "2026-10-05T00:00:00Z",
    electionDate: "2026-10-06T00:00:00Z", contentSha256: "a".repeat(64), parserVersion: "qa-1",
    authorizationReference: "SIN VALIDEZ", licenseDeclaration: "SIMULACIÓN",
    sourceArtifactPath: null, recordCount: 2, departmentCount: 1, municipalityCount: 1,
    zoneCount: 0, pollingPlaceCount: 0, physicalPollingPlaceCount: null, expectedTableCount: 0,
    validationSummary: null, rejectionReason: null, createdById: "creator", validatedById: "reviewer",
    activatedById: null, approvedById: null, supersededByReleaseId: null,
    createdAt: "2026-10-05T00:00:00Z", validatedAt: null, activatedAt: null, supersededAt: null,
  };
}

function renderCatalog(type: ElectoralCatalogType, status: ElectoralCatalogStatus) {
  const item = release(type, status);
  const integrity = {
    valid: false, blockingIssues: ["HALLAZGO_REAL_DEL_SERVIDOR"],
    counts: { additionalVotingDayRepresentations: null },
    gaps: { departmentsWithoutMunicipalities: 0, municipalitiesWithoutZones: 1122, zonesWithoutPollingPlaces: 0,
      pollingPlacesWithoutCoordinates: 0, pollingPlacesWithoutCommune: 0, pollingPlaceRecordsWithoutAddress: 0,
      physicalPollingPlacesWithoutAddress: null, physicalPollingPlacesWithoutTimeZone: null },
  };
  return renderPage("components/electoral-catalog/ElectoralCatalogConsole.tsx", [[item], {
    detail: { release: item, entries: [], pagination: { hasMore: false, nextCursorId: null } }, gaps: { integrity },
  }], "ElectoralCatalogConsole");
}

test("DANE validado explica el límite y conserva diagnóstico sin ofrecer activación RNEC", () => {
  const html = renderCatalog("ADMINISTRATIVE_DANE", "VALIDATED");
  expect(html).toContain("La activación de esta fuente no");
  expect(html).not.toContain("Aprobar y activar");
  expect(html).not.toContain("Confirmo que comparé");
  expect(html).toContain("no son requisitos de cobertura de DANE");
  expect(html).toContain("HALLAZGO_REAL_DEL_SERVIDOR");
  expect(html).toContain("1.122");
  expect(html).toContain("No verificable en release anterior");
  expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Ver diagnóstico/);
});

test("DANE en preparación mantiene validación de estructura sin declaración de RNEC", () => {
  const html = renderCatalog("ADMINISTRATIVE_DANE", "STAGED");
  expect(html).toContain("Validar estructura");
  expect(html).toContain("la fuente DANE declarada");
  expect(html).not.toContain("Confirmo que comparé la huella completa, la URL declarada de RNEC");
});

test("RNEC conserva huella, confirmación y activación inicialmente bloqueada", () => {
  const html = renderCatalog("ELECTORAL_RNEC", "VALIDATED");
  expect(html).toContain("SHA-256 revisado (64 caracteres)");
  expect(html).toContain("Confirmo que comparé la huella completa, la URL declarada de RNEC");
  expect(html).toContain("ACTIVAR aaaaaaaa…aaaaaaaa");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Aprobar y activar<\/button>/s);
  expect(html).toMatch(/<details[^>]*open=""[^>]*>\s*<summary[^>]*>Ver diagnóstico/);
});

test("Auditoría conserva códigos desconocidos y el resultado registrado sin inferirlo de la acción", () => {
  const common = { id: "qa", resourceId: "registro-qa", occurredAt: "2026-10-06T12:00:00Z", actor: null, outcome: "SUCCESS" } as const;
  const items: AuditEvent[] = [
    { ...common, action: "MFA_VERIFICATION_FAILED", resourceType: "User" },
    { ...common, id: "unknown", action: "CODIGO_DESCONOCIDO", resourceType: "OtroRegistro" },
    { ...common, id: "prototype", action: "constructor", resourceType: "toString" },
  ];
  const html = renderPage("app/dashboard/audit/page.tsx", [{ items, pagination: { total: 3, totalPages: 1, page: 1 } }]);
  expect(html).toContain("Verificación de doble factor rechazada");
  expect(html).toContain("Exitosa");
  expect(html).toContain("CODIGO_DESCONOCIDO");
  expect(html).not.toContain("codigo desconocido");
  expect(html).toContain("constructor");
  expect(html).toContain("toString");
  expect(html).toContain('value="PROPOSAL_CREATED">Propuesta creada');
  expect(html).toContain('value="PoliticalProposal">Propuesta');
  expect(html).toContain("Buscar por un código que no aparece");
  expect(html).toContain("Ver códigos del registro");
});

test("Sellos permite consultar al auditor sin ofrecer firma ni inventar un selector de comprobación", () => {
  const html = renderPage("app/dashboard/integrity-signatures/page.tsx", [{ items: [], truncated: false }], "default", "AUDITOR");
  expect(html).toContain("Comprobar un sello");
  expect(html).toContain("Esta consulta no dispone");
  expect(html).toContain('id="verifySignatureId"');
  expect(html).toContain('id="verifyResourceId"');
  expect(html).not.toContain('id="signatureOtp"');
  expect(html).not.toContain("Crear un sello");
});
