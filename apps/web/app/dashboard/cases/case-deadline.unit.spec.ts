import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "page.tsx",
  readFileSync(join(__dirname, "page.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function handler(name: string) {
  const node = source.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  let found = node?.getText(source);
  if (!found) {
    const visit = (child: ts.Node) => {
      if (ts.isFunctionDeclaration(child) && child.name?.text === name) found = child.getText(source);
      ts.forEachChild(child, visit);
    };
    visit(source);
  }
  if (!found) throw new Error(`No se encontró ${name}`);
  return ts.transpileModule(found, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

test("el caso interno envía sólo la fecha elegida y muestra la respuesta con día Colombia", async () => {
  let sent: unknown;
  let reset = false;
  const scope = {
    form: {
      title: "Caso de prueba", description: "Detalle", category: "Servicios",
      sourceChannel: "WEB", priority: "MEDIUM", confidential: false,
      dueDate: "2026-10-16", externalContactRef: "", assigneeId: "",
    },
    createIssueCase: async (input: unknown) => { sent = input; },
    setSaving: () => {}, setMutationError: () => {},
    setForm: () => { reset = true; }, setIsCreateOpen: () => {},
    setNotice: () => {}, setFilters: () => {}, setReload: () => {}, readableError: String,
  };
  const create = runInNewContext(`${handler("handleCreate")} handleCreate;`, scope) as (event: { preventDefault: () => void }) => Promise<void>;
  await create({ preventDefault() {} });
  expect(sent).toMatchObject({ dueAt: "2026-10-16" });
  expect(reset).toBe(true);
  const format = runInNewContext(`${handler("formatDate")} formatDate;`) as (value: string | null) => string;
  expect(format("2026-10-17T04:59:59.999Z")).toMatch(/^16.*oct.*2026$/u);
});
