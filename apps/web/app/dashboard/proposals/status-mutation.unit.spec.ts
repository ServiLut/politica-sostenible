import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { allowedProposalStatuses } from "../../../lib/proposals-api";
import type { PoliticalProposal, ProposalStatus } from "../../../lib/proposals-api";
import { createPageRequestState } from "../../../lib/use-page-request-state";

// Execute the page's actual async handler with the real query lifecycle. Only
// network calls and React setters are replaced; no duplicate mutation algorithm.
const source = ts.createSourceFile(
  "page.tsx",
  readFileSync(join(__dirname, "page.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declarations: string[] = [];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name &&
      ["handleStatusChange", "errorMessage"].includes(node.name.text)) {
    declarations.push(node.getText(source));
  }
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(
    (declaration) => declaration.name.getText(source) === "STATUS_LABELS",
  )) declarations.push(node.getText(source));
  ts.forEachChild(node, collect);
}
collect(source);
expect(declarations).toHaveLength(3);
const code = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type Feedback = Record<string, { kind: "success" | "error"; message: string }>;
type Setter<T> = T | ((previous: T) => T);
const proposal = {
  id: "proposal-a", title: "Programa sintético A", status: "DRAFT", progressPercent: 0,
} as PoliticalProposal;
const otherProposal = { ...proposal, id: "proposal-b", title: "Programa sintético B" };

async function harness({
  update,
  fetch = async () => [proposal, otherProposal],
  canMutate = true,
}: {
  update: (id: string, input: { status: ProposalStatus }) => Promise<PoliticalProposal>;
  fetch?: (signal: AbortSignal) => Promise<PoliticalProposal[]>;
  canMutate?: boolean;
}) {
  const query = createPageRequestState(fetch, true, true);
  await query.start();
  const state = { saving: new Set<string>(), feedback: {} as Feedback, refreshes: 0 };
  const scope = {
    canMutate,
    Error,
    allowedProposalStatuses,
    statusRequests: { current: new Set<string>() },
    updateProposal: update,
    setProposals: query.setData,
    setSavingStatuses(value: Set<string>) { state.saving = value; },
    setStatusFeedback(value: Setter<Feedback>) {
      state.feedback = typeof value === "function" ? value(state.feedback) : value;
    },
    loadProposals: () => { state.refreshes += 1; return query.refresh(); },
  };
  const handleStatusChange = runInNewContext(`${code}\nhandleStatusChange`, scope) as
    (record: PoliticalProposal, status: ProposalStatus) => Promise<void>;
  return { state, query, handleStatusChange };
}

test("un rechazo no muestra un estado optimista y el error persiste después de recargar", async () => {
  const response = Promise.withResolvers<PoliticalProposal>();
  const calls: unknown[] = [];
  const model = await harness({ update: async (id, input) => {
    calls.push({ id, input });
    return response.promise;
  } });
  const saving = model.handleStatusChange(proposal, "PROPOSED");
  expect(model.query.getSnapshot().data?.[0].status).toBe("DRAFT");
  expect(model.state.saving.has(proposal.id)).toBe(true);
  response.reject(new Error("No tienes permiso para este cambio."));
  await saving;
  expect(model.query.getSnapshot().data?.[0].status).toBe("DRAFT");
  expect(model.state.feedback[proposal.id].kind).toBe("error");
  expect(model.state.feedback[proposal.id].message).toContain("No tienes permiso");
  expect(model.state.saving.size).toBe(0);
  expect(model.state.refreshes).toBe(0);
  await model.query.refresh();
  expect(model.state.feedback[proposal.id].message).toContain("No tienes permiso");
  expect(calls).toEqual([{ id: proposal.id, input: { status: "PROPOSED" } }]);
  model.query.stop();
});

test("el bloqueo es síncrono por propuesta; otra propuesta puede guardarse y no libera la primera", async () => {
  const first = Promise.withResolvers<PoliticalProposal>();
  const second = Promise.withResolvers<PoliticalProposal>();
  const calls: string[] = [];
  const model = await harness({ update: async (id) => {
    calls.push(id);
    return id === proposal.id ? first.promise : second.promise;
  } });
  const savingFirst = model.handleStatusChange(proposal, "PROPOSED");
  await model.handleStatusChange(proposal, "WITHDRAWN");
  const savingSecond = model.handleStatusChange(otherProposal, "PROPOSED");
  expect(calls).toEqual([proposal.id, otherProposal.id]);
  expect(model.state.saving.size).toBe(2);
  second.resolve({ ...otherProposal, status: "PROPOSED" });
  await savingSecond;
  expect([...model.state.saving]).toEqual([proposal.id]);
  first.reject(new Error("Cambio rechazado"));
  await savingFirst;
  expect(model.state.feedback[proposal.id].kind).toBe("error");
  expect(model.state.feedback[otherProposal.id].kind).toBe("success");
  expect(model.state.saving.size).toBe(0);
  model.query.stop();
});

test("un GET fallido conserva el registro confirmado y distingue el error de lectura del guardado", async () => {
  let reads = 0;
  const model = await harness({
    update: async () => ({ ...proposal, status: "PROPOSED", progressPercent: 0 }),
    fetch: async () => {
      if (reads++ === 0) return [proposal];
      throw new Error("Listado no disponible");
    },
  });
  await model.handleStatusChange(proposal, "PROPOSED");
  expect(model.query.getSnapshot().data?.[0].status).toBe("PROPOSED");
  expect((model.query.getSnapshot().error as Error).message).toBe("Listado no disponible");
  expect(model.state.feedback[proposal.id].kind).toBe("success");
  expect(model.state.feedback[proposal.id].message).toContain("estado guardado como Propuesta");
  expect(model.state.refreshes).toBe(1);
  model.query.stop();
});

test("un GET anterior resuelto tarde no revierte el PATCH ni la relectura posterior", async () => {
  const oldRead = Promise.withResolvers<PoliticalProposal[]>();
  const signals: AbortSignal[] = [];
  let reads = 0;
  const confirmed = { ...proposal, status: "PROPOSED" as const };
  const model = await harness({
    update: async () => confirmed,
    fetch: async (signal) => {
      signals.push(signal);
      if (++reads === 2) return oldRead.promise;
      return reads === 1 ? [proposal] : [confirmed];
    },
  });
  const staleRefresh = model.query.refresh();
  await model.handleStatusChange(proposal, "PROPOSED");
  expect(signals[1].aborted).toBe(true);
  oldRead.resolve([proposal]);
  await staleRefresh;
  expect(model.query.getSnapshot().data).toEqual([confirmed]);
  expect(model.state.feedback[proposal.id].kind).toBe("success");
  model.query.stop();
});

test("un éxito distinto no borra el error pendiente de otra propuesta", async () => {
  const model = await harness({ update: async (id) => {
    if (id === proposal.id) throw new Error("No se pudo confirmar A");
    return { ...otherProposal, status: "PROPOSED" };
  } });
  await model.handleStatusChange(proposal, "PROPOSED");
  const error = model.state.feedback[proposal.id];
  await model.handleStatusChange(otherProposal, "PROPOSED");
  expect(model.state.feedback[proposal.id]).toEqual(error);
  model.query.stop();
});

test("consulta, estado idéntico y transición no permitida no envían PATCH", async () => {
  let mutations = 0;
  const update = async () => { mutations += 1; return proposal; };
  const readOnly = await harness({ update, canMutate: false });
  await readOnly.handleStatusChange(proposal, "PROPOSED");
  const editable = await harness({ update });
  await editable.handleStatusChange(proposal, "DRAFT");
  await editable.handleStatusChange(proposal, "COMPLETED");
  await editable.handleStatusChange({ ...proposal, status: "COMPLETED" }, "DRAFT");
  expect(mutations).toBe(0);
  expect(editable.state.refreshes).toBe(0);
  expect(editable.state.feedback).toEqual({});
  readOnly.query.stop();
  editable.query.stop();
});
