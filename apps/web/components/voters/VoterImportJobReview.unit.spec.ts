import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { VoterImportJob } from "../../lib/import-api";
import * as jobHelpers from "../../lib/voter-import-job";

const filename = resolve(
  process.cwd(),
  "apps/web/components/voters/VoterImportJobReview.tsx",
);
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const nativeRequire = createRequire(filename);
const componentModule = {
  exports: {} as typeof import("./VoterImportJobReview"),
};
runInNewContext(`(function(require, module, exports) { ${compiled}\n})`)(
  (id: string) => {
    if (id === "@/lib/import-api")
      return {
        getVoterImportJobErrors: () => {
          throw new Error("No network while rendering");
        },
      };
    if (id === "@/lib/voter-import-job") return jobHelpers;
    if (id === "@/lib/use-page-request")
      return {
        usePageRequest: () => ({
          loading: false,
          error: null,
          refresh: () => {},
          data: {
            items: [
              {
                row: 4,
                errors: [
                  { field: "Documento", message: "Repetido" },
                  { field: "Correo", message: "Formato inválido" },
                ],
              },
            ],
            pagination: { page: 1, totalPages: 1 },
          },
        }),
      };
    return nativeRequire(id);
  },
  componentModule,
  componentModule.exports,
);

const job: VoterImportJob = {
  id: "synthetic-job",
  fileName: "personas.csv",
  status: "READY",
  totalRows: 4,
  validRows: 2,
  errorRows: 1,
  skippedRows: 1,
  importedRows: 0,
  attempts: 1,
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:01Z",
  completedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  canExecute: true,
  canRetry: false,
  progress: { phase: "validation", processed: 4, total: 4 },
};
function render(next: VoterImportJob) {
  return renderToStaticMarkup(
    createElement(componentModule.exports.VoterImportJobReview, { job: next }),
  );
}

test("la revisión muestra una fila con dos motivos, descarga y conteos separados", () => {
  const html = render(job);
  expect(html).toContain("Nuevas listas");
  expect(html).toContain("Ya existentes");
  expect(html).toContain("Filas con errores");
  expect(html).toContain("Fila 4");
  expect(html).toContain("Repetido");
  expect(html).toContain("Formato inválido");
  expect(html).toContain("Descargar filas con errores");
  expect(html).toContain("Una fila con varios errores se cuenta una sola vez");
  expect(html).not.toContain("Importación terminada");
});

test("espera sin total no dibuja avance ficticio y explica que puede volver después", () => {
  const html = render({
    ...job,
    status: "VALIDATING",
    errorRows: 0,
    progress: { phase: "validation", total: null, processed: 0 },
  });
  expect(html).not.toContain("<progress");
  expect(html).toContain("volver desde Importaciones recientes");
  expect(html).toContain("Preparando la revisión");
  expect(html).toContain("los conteos son parciales");
});

test("fallo parcial informa lo guardado y no anuncia éxito", () => {
  const html = render({
    ...job,
    status: "FAILED",
    importedRows: 1,
    validRows: 1,
    lastErrorMessage: "Servicio temporalmente no disponible",
  });
  expect(html).toContain("Ya se guardó 1 persona");
  expect(html).toContain("el resultado parcial se conserva");
  expect(html).not.toContain("Importación terminada");
});
