import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("page.tsx", readFileSync(join(__dirname, "page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(kind: "open" | "focus") {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (kind === "open" && ts.isVariableDeclaration(node) && node.name.getText(source) === "openDetail" && node.initializer && ts.isCallExpression(node.initializer)) found = node.initializer.arguments[0];
    if (kind === "focus" && ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("headingRef.current.scrollIntoView")) found = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error(`Falta el callback de ${kind}`);
  return ts.transpileModule(`(${found.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}

function harness(getDetail: (id: string) => Promise<{ id: string }>) {
  const focusRequest = { current: null as string | null };
  const calls: unknown[] = [];
  let committed: { id: string } | null = null;
  const scope = {
    AbortController, detailRequest: { current: null as AbortController | null }, detailFocusRequest: focusRequest,
    setDetailLoading: () => {}, setDetail: (value: { id: string } | null) => { committed = value; }, setError: () => {},
    getPqrsdDetail: getDetail, readableError: String,
  };
  const open = runInNewContext(expression("open"), scope) as (id: string, purpose: string, signal?: AbortSignal, focusOnReady?: boolean) => Promise<void>;
  const focus = (id: string) => (runInNewContext(expression("focus"), {
    focusRequestRef: focusRequest, detail: { id }, headingRef: { current: {
      focus: (options: unknown) => calls.push({ focus: options }),
      scrollIntoView: (options: unknown) => calls.push({ scroll: options }),
    } },
  }) as () => void)();
  return { open, focus, calls, focusRequest, committed: () => committed };
}

test("abrir expresamente dirige el foco al expediente cargado una sola vez y sin animación", async () => {
  const h = harness(async (id) => ({ id }));
  await h.open("expediente-a", "Revisión de prueba", undefined, true);
  h.focus("expediente-a");
  h.focus("expediente-a");
  expect(h.committed()).toEqual({ id: "expediente-a" });
  expect(h.calls).toEqual([{ focus: { preventScroll: true } }, { scroll: { behavior: "auto", block: "start" } }]);
  expect(h.focusRequest.current).toBeNull();
});

test("una recarga de continuidad o automática no roba el foco", async () => {
  const h = harness(async (id) => ({ id }));
  await h.open("expediente-a", "Continuidad sin apertura explícita");
  h.focus("expediente-a");
  expect(h.calls).toEqual([]);
});

test("una respuesta de apertura anterior cancelada no dirige el foco al expediente equivocado", async () => {
  const pending = new Map<string, (value: { id: string }) => void>();
  const h = harness((id) => new Promise((resolve) => pending.set(id, resolve)));
  const first = h.open("a", "Revisión primera", undefined, true);
  const second = h.open("b", "Revisión segunda", undefined, true);
  pending.get("a")!({ id: "a" });
  await first;
  h.focus("a");
  expect(h.calls).toEqual([]);
  expect(h.committed()).toBeNull();
  pending.get("b")!({ id: "b" });
  await second;
  h.focus("b");
  expect(h.calls).toHaveLength(2);
  expect(h.committed()).toEqual({ id: "b" });
});

test("una apertura fallida no deja una petición de foco pendiente", async () => {
  const h = harness(async () => { throw new Error("Sin acceso"); });
  await h.open("a", "Revisión fallida", undefined, true);
  h.focus("a");
  expect(h.focusRequest.current).toBeNull();
  expect(h.calls).toEqual([]);
});
