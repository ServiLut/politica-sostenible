import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
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
