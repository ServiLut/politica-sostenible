import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = ts.createSourceFile("page.tsx", readFileSync(join(__dirname, "page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function codeFor(name: string) {
  let code = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!code) throw new Error(`Handler ${name} ausente`);
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}

test("alta real incluye sólo el ID municipal seleccionado y limpia borrador después de éxito", async () => {
  const posted: unknown[] = [];
  let reset: unknown;
  const scope = {
    form: { title: "PRUEBA", description: "Técnica", category: "Tecnología", sourceChannel: "INTERNAL", priority: "LOW", externalContactRef: "", assigneeId: "", dueDate: "", confidential: false, municipality: { id: "mun-del-catalogo", name: "ARMENIA", parent: { name: "ANTIOQUIA" } } },
    createIssueCase: async (body: unknown) => { posted.push(body); },
    setSaving: () => {}, setMutationError: () => {}, setIsCreateOpen: () => {}, setNotice: () => {}, setFilters: () => {}, setReload: () => {},
    setForm: (value: unknown) => { reset = value; },
    INCIDENT_CATEGORIES: ["Seguridad"], readableError: String,
  };
  const create = runInNewContext(`${codeFor("handleCreate")} handleCreate;`, scope) as (event: { preventDefault: () => void }) => Promise<void>;
  await create({ preventDefault: () => {} });
  expect(JSON.parse(JSON.stringify(posted[0]))).toEqual({ title: "PRUEBA", description: "Técnica", category: "Tecnología", sourceChannel: "INTERNAL", priority: "LOW", confidential: false, divisionId: "mun-del-catalogo" });
  expect(reset).toMatchObject({ municipality: null, title: "" });
});

test("una falla al guardar no borra el municipio elegido ni cierra el formulario", async () => {
  let cleared = false; let closed = false; let error: unknown;
  const scope = {
    form: { title: "PRUEBA", description: "Técnica", category: "Tecnología", sourceChannel: "INTERNAL", municipality: { id: "mun-elegido" } },
    createIssueCase: async () => { throw new Error("Municipio ya no disponible"); },
    setSaving: () => {}, setMutationError: (value: unknown) => { error = value; },
    setForm: () => { cleared = true; }, setIsCreateOpen: () => { closed = true; },
    readableError: (value: Error) => value.message,
  };
  const create = runInNewContext(`${codeFor("handleCreate")} handleCreate;`, scope) as (event: { preventDefault: () => void }) => Promise<void>;
  await create({ preventDefault: () => {} });
  expect(cleared).toBe(false); expect(closed).toBe(false);
  expect(scope.form.municipality.id).toBe("mun-elegido");
  expect(error).toBe("Municipio ya no disponible");
});

for (const municipality of [null, { id: "otro-municipio", name: "Bello" }]) {
  test(`edición real transmite únicamente la diferencia territorial ${municipality?.id ?? "null"}`, () => {
    let sent: unknown;
    const incident = { divisionId: "municipio-original", status: "OPEN", priority: "LOW", assigneeId: null, dueAt: null };
    const scope = {
      incident, status: "OPEN", priority: "LOW", assigneeId: "", dueDate: "", municipality,
      toDateInput: () => "", onSave: (_record: unknown, input: unknown) => { sent = input; },
    };
    const save = runInNewContext(`${codeFor("save")} save;`, scope) as () => void;
    save();
    expect(sent).toEqual({ divisionId: municipality?.id ?? null });
  });
}

test("editar otro campo no sustituye un vínculo territorial existente fuera del catálogo visible", () => {
  let sent: unknown;
  const incident = { divisionId: "division-fuera-pagina", status: "OPEN", priority: "LOW", assigneeId: null, dueAt: null };
  const scope = {
    incident, status: "OPEN", priority: "HIGH", assigneeId: "", dueDate: "", municipality: { id: incident.divisionId, name: "Territorio vinculado" },
    toDateInput: () => "", onSave: (_record: unknown, input: unknown) => { sent = input; },
  };
  (runInNewContext(`${codeFor("save")} save;`, scope) as () => void)();
  expect(sent).toEqual({ priority: "HIGH" });
});

function renderIncidentCard(canMutate: boolean) {
  const filename = join(__dirname, "page.tsx");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const componentModule = { exports: {} as { Card: ComponentType<Record<string, unknown>> } };
  const realRequire = createRequire(filename);
  const scopedRequire = (name: string) => {
    if (name === "@/components/ui/UserCombobox") return { UserCombobox: () => createElement("span", { "data-testid": "assignee-control" }) };
    if (name === "@/components/territory/IncidentMunicipalitySelector") return { IncidentMunicipalitySelector: () => createElement("span", { "data-testid": "municipality-control" }) };
    if (name.startsWith("@/") || name === "next/navigation") return {};
    return realRequire(name);
  };
  runInNewContext(`(function(require, module, exports) { ${compiled}\nexports.Card = IncidentCard; })`)(scopedRequire, componentModule, componentModule.exports);
  return renderToStaticMarkup(createElement(componentModule.exports.Card, {
    canMutate, saving: false, onSave: async () => {}, onOpenInteractions: () => {},
    incident: {
      id: "incident-qa", reference: "INC-QA", title: "PRUEBA DE PRESENTACIÓN",
      description: "Descripción conservada", category: "Tecnología", sourceChannel: "INTERNAL",
      status: "TRIAGED", priority: "LOW", confidential: false, dueAt: "2035-01-02T12:00:00Z",
      assigneeId: "person-qa", assignee: { id: "person-qa", name: "Responsable de prueba" },
      divisionId: "municipality-qa", division: { id: "municipality-qa", name: "Municipio de prueba" },
      resolutionReady: false, _count: { interactions: 2 },
    },
  }));
}

test("gestionar un incidente conserva los controles montados y deja el resumen fuera del apartado cerrado", () => {
  const html = renderIncidentCard(true);
  const detailsStart = html.indexOf("<details");
  const summary = html.slice(0, detailsStart);
  expect(summary).toContain("PRUEBA DE PRESENTACIÓN");
  expect(summary).toContain("Responsable de prueba");
  expect(summary).toContain("Municipio de prueba");
  expect(summary).toContain("Validado y clasificado");
  expect(summary).toContain("Ver bitácora · 2");
  expect(html).toMatch(/<details(?![^>]*\bopen)[^>]*>.*Gestionar incidente.*Estado operativo.*Guardar respuesta.*<\/details>/s);
  expect(html).toContain('data-testid="assignee-control"');
  expect(html).toContain('data-testid="municipality-control"');
  expect(html).toMatch(/<option value="RESOLVED" disabled="">/);
  expect(html).toContain("requiere resultado en bitácora");
});

test("un lector mantiene resumen y bitácora sin recibir controles de edición", () => {
  const html = renderIncidentCard(false);
  expect(html).toContain("Responsable de prueba");
  expect(html).toContain("Ver bitácora · 2");
  expect(html).not.toContain("Gestionar incidente");
  expect(html).not.toContain("Guardar respuesta");
  expect(html).not.toContain('data-testid="assignee-control"');
});
