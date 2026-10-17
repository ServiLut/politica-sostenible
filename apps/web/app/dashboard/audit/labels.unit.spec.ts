import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { AuditEvent } from "../../../lib/audit-events-api";

// Use the actual presentation dictionary and detail component, without loading
// the Next page's authentication or network hooks into this unit test.
const source = ts.createSourceFile("page.tsx", readFileSync(join(__dirname, "page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations: string[] = [];
for (const node of source.statements) {
  if (ts.isFunctionDeclaration(node) && node.name && ["actionLabel", "resourceTypeLabel", "TechnicalDetails"].includes(node.name.text)) declarations.push(node.getText(source));
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ["ACTION_LABELS", "RESOURCE_LABELS"].includes(item.name.getText(source)))) declarations.push(node.getText(source));
}
expect(declarations).toHaveLength(5);
const code = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
}).outputText;
const presentation = runInNewContext(`${code}\n({ actionLabel, resourceTypeLabel, TechnicalDetails })`, { React }) as {
  actionLabel(code: string): string;
  resourceTypeLabel(code: string): string;
  TechnicalDetails(props: { event: AuditEvent }): React.ReactElement;
};

test("presenta actualización de propuesta y gestión de contacto en español", () => {
  expect(presentation.actionLabel("PROPOSAL_UPDATED")).toBe("Propuesta actualizada");
  expect(presentation.resourceTypeLabel("Interaction")).toBe("Gestión de contacto");
  expect(presentation.actionLabel("INTERACTION_RECORDED")).toBe("Gestión de contacto registrada");
});

test("distingue inicio, interrupción y generación de exportación sin afirmar recepción del archivo", () => {
  expect(presentation.actionLabel("DATA_EXPORT_STARTED")).toBe("Exportación iniciada");
  expect(presentation.actionLabel("DATA_EXPORT_INTERRUPTED")).toBe("Exportación interrumpida");
  expect(presentation.actionLabel("DATA_EXPORTED")).toBe("Archivo de exportación generado");
});

test("el detalle conserva los códigos originales y el identificador del registro", () => {
  const html = renderToStaticMarkup(presentation.TechnicalDetails({ event: {
    action: "PROPOSAL_UPDATED", resourceType: "Interaction", resourceId: "registro-sintetico",
  } as AuditEvent }));
  expect(html).toContain("Ver códigos del registro");
  expect(html).toContain("PROPOSAL_UPDATED");
  expect(html).toContain("Interaction");
  expect(html).toContain("registro-sintetico");
  expect(html).not.toContain("Propuesta actualizada");
});

test("códigos nuevos o propiedades heredadas permanecen visibles sin etiquetarlos incorrectamente", () => {
  expect(presentation.actionLabel("FUTURE_ACTION")).toBe("FUTURE_ACTION");
  expect(presentation.resourceTypeLabel("FutureResource")).toBe("FutureResource");
  expect(presentation.actionLabel("constructor")).toBe("constructor");
  expect(presentation.resourceTypeLabel("__proto__")).toBe("__proto__");
});
