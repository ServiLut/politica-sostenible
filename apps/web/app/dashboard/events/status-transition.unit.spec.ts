import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ApiError } from "../../../lib/api-client";
import type { CampaignEvent, CampaignEventStatus } from "../../../lib/events-api";

// Exercise the actual page handler; replace only UI setters and network I/O.
const source = ts.createSourceFile("page.tsx", readFileSync(join(__dirname, "page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations: string[] = [];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && ["changeStatus", "readableError", "statusLabel"].includes(node.name.text)) declarations.push(node.getText(source));
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ["TRANSITIONS", "STATUSES"].includes(item.name.getText(source)))) declarations.push(node.getText(source));
  ts.forEachChild(node, collect);
}
collect(source);
expect(declarations).toHaveLength(5);
const code = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const event = { id: "event-synthetic", name: "Evento sintético", status: "IN_PROGRESS" } as CampaignEvent;

function harness(confirm: () => Promise<boolean>, transitionEvent: () => Promise<unknown> = async () => undefined) {
  const state = { mutation: null as string | null, error: null as string | null, notice: null as string | null, refreshes: 0, filters: { page: 3, search: "sintético" } };
  const scope = {
    canManage: true, mutation: null, statusTransitionPending: { current: false },
    confirm, transitionEvent, Error, ApiError,
    setMutation(value: string | null) { state.mutation = value; },
    setMutationError(value: string | null) { state.error = value; },
    setNotice(value: string | null) { state.notice = value; },
    setSavedEventId() {},
    setFilters(updater: (value: typeof state.filters) => typeof state.filters) { state.filters = updater(state.filters); },
    setReloadKey(updater: (value: number) => number) { state.refreshes = updater(state.refreshes); },
  };
  const changeStatus = runInNewContext(`${code}\nchangeStatus`, scope) as (event: CampaignEvent, status: CampaignEventStatus) => Promise<void>;
  return { state, scope, changeStatus };
}

for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
  test(`${terminal}: no envía PATCH antes de confirmar y cancelar libera el bloqueo sin cambiar la lista`, async () => {
    const choice = Promise.withResolvers<boolean>();
    let confirmations = 0;
    let patches = 0;
    const model = harness(() => { confirmations++; return choice.promise; }, async () => { patches++; });
    const waiting = model.changeStatus(event, terminal);
    await model.changeStatus(event, terminal);
    expect(confirmations).toBe(1);
    expect(patches).toBe(0);
    choice.resolve(false);
    await waiting;
    expect(patches).toBe(0);
    expect(model.state.mutation).toBeNull();
    expect(model.state.notice).toBeNull();
    expect(model.state.refreshes).toBe(0);
    expect(model.state.filters.page).toBe(3);
    expect(model.scope.statusTransitionPending.current).toBe(false);
  });
}

test("un rechazo no anuncia éxito ni recarga la lista; un segundo intento requiere nueva confirmación", async () => {
  let confirmations = 0;
  let patches = 0;
  const model = harness(async () => { confirmations++; return true; }, async () => {
    if (++patches === 1) throw new Error("Actualiza el evento antes de reintentar.");
  });
  await model.changeStatus(event, "COMPLETED");
  expect(model.state.error).toContain("Actualiza el evento");
  expect(model.state.notice).toBeNull();
  expect(model.state.refreshes).toBe(0);
  await model.changeStatus(event, "COMPLETED");
  expect(confirmations).toBe(2);
  expect(patches).toBe(2);
  expect(model.state.error).toBeNull();
  expect(model.state.notice).toContain("Finalizado");
  expect(model.state.filters).toEqual({ page: 1, search: "sintético" });
  expect(model.state.refreshes).toBe(1);
});

test("programar e iniciar conservan la transición directa; finales existentes no envían otra transición", async () => {
  let confirmations = 0;
  let patches = 0;
  const model = harness(async () => { confirmations++; return true; }, async () => { patches++; });
  await model.changeStatus({ ...event, status: "DRAFT" }, "SCHEDULED");
  await model.changeStatus({ ...event, status: "SCHEDULED" }, "IN_PROGRESS");
  await model.changeStatus({ ...event, status: "COMPLETED" }, "CANCELLED");
  expect(patches).toBe(2);
  expect(confirmations).toBe(0);
});
