import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { IssueCase } from "../../lib/cases-api";
import { createPageRequestState } from "../../lib/use-page-request-state";
import * as consentAcceptance from "../../lib/case-consent-acceptance";

const filename = resolve(process.cwd(), "apps/web/components/cases/CaseInteractionsPanel.tsx");
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const issueCase: IssueCase = {
  id: "case-synthetic-1", mode: "PUBLIC_OFFICE", reference: "QA-INTERNAL-1",
  title: "PRUEBA gestión interna", description: "SIMULACIÓN SIN VALIDEZ",
  category: "QA", sourceChannel: "INTERNAL", status: "OPEN", priority: "MEDIUM",
  voterId: null, externalContactRef: null, divisionId: null, assigneeId: null,
  createdById: null, confidential: false, dueAt: null, firstResponseAt: null,
  resolvedAt: null, resolutionReady: false, createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z", assignee: null, createdBy: null,
  voter: null, division: null, _count: { interactions: 0, tasks: 0, commitments: 0 },
};

async function renderPanel(currentCase: IssueCase, canCreate = true) {
  const nativeRequire = createRequire(filename);
  const requests: Array<ReturnType<typeof createPageRequestState<unknown>>> = [];
  const calls = { interactions: 0, consent: 0 };
  const emptyPage = { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
  const interactionsApi = {
    listInteractions: async () => { calls.interactions += 1; return emptyPage; },
    getCaseConsentStatus: async () => { calls.consent += 1; throw new Error("Fallo temporal de red"); },
  };
  const componentModule = { exports: {} as { CaseInteractionsPanel: typeof import("./CaseInteractionsPanel").CaseInteractionsPanel } };
  const requireModule = (id: string) => {
    if (id === "@/lib/interactions-api") return interactionsApi;
    if (id === "@/lib/case-consent-acceptance") return consentAcceptance;
    if (id === "@/lib/api-client") return { ApiError: class ApiError extends Error {} };
    if (id === "@/lib/use-page-request") return {
      usePageRequest(request: (signal: AbortSignal) => Promise<unknown>, options: { enabled?: boolean }) {
        const state = createPageRequestState(request, options.enabled);
        requests.push(state);
        const isConsent = requests.length === 2;
        return {
          data: isConsent ? null : emptyPage,
          loading: false,
          error: isConsent && options.enabled !== false ? new Error("Fallo temporal de red") : null,
          setData: () => {},
        };
      },
    };
    return nativeRequire(id);
  };
  runInNewContext(`(function(require, module, exports) { ${compiled}\n})`)(requireModule, componentModule, componentModule.exports);
  const html = renderToStaticMarkup(createElement(componentModule.exports.CaseInteractionsPanel, {
    issueCase: currentCase, canCreate, canGrantConsent: true, canRevokeConsent: true,
    onCreated: () => {}, onClose: () => {},
  }));
  // Exercise the actual request lifecycle with the component's enabled flags.
  await Promise.all(requests.map(state => state.start()));
  requests.forEach(state => state.stop());
  return { html, calls };
}

test("caso sin contacto consulta la bitácora pero no solicita permiso inexistente", async () => {
  const { html, calls } = await renderPanel(issueCase);
  expect(calls).toEqual({ interactions: 1, consent: 0 });
  expect(html).toContain("Puedes registrar actuaciones y resultados internos");
  expect(html).toContain("Las gestiones salientes requieren vincular un contacto");
  expect(html).not.toContain("No se pudo verificar el permiso");
  expect(html).not.toContain("Reintentar");
  expect(html).not.toContain("Registrar autorización");
  expect(html.match(/value="INTERNAL" selected=""/gu)).toHaveLength(2);
  expect(html).toContain("primera gestión del caso");
});

test("la vista interna de solo lectura no ofrece registrar ni autorizar", async () => {
  const { html, calls } = await renderPanel(issueCase, false);
  expect(calls.consent).toBe(0);
  expect(html).toContain("La bitácora documenta las actuaciones");
  expect(html).not.toContain("Puedes registrar");
  expect(html).not.toContain("Guardar en bitácora");
  expect(html).not.toContain("Registrar autorización");
});

for (const relation of [{ voterId: "person-synthetic-1" }, { externalContactRef: "QA-CONTACT-1" }]) {
  test(`caso con ${Object.keys(relation)[0]} conserva verificación y reintento ante fallo real`, async () => {
    const { html, calls } = await renderPanel({ ...issueCase, ...relation });
    expect(calls).toEqual({ interactions: 1, consent: 1 });
    expect(html).toContain("Permiso de contacto");
    expect(html).toContain("No se pudo verificar el permiso");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("Puedes registrar actuaciones y resultados internos");
  });
}
