import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createPageRequestState } from "../../../lib/use-page-request-state";
import type {
  Commitment,
  CommitmentPage,
  CommitmentStatus,
} from "../../../lib/work-api";
import { taskFiltersAfterMutation } from "./task-editor";

// Execute the actual page handlers without a browser. Dependencies replace only
// React setters and transport; no duplicate mutation implementation is tested.
const source = ts.createSourceFile(
  "page.tsx",
  readFileSync(join(__dirname, "page.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const handlerNames = new Set([
  "refreshCommitmentsAfterMutation",
  "handleCommitmentStatus",
  "handleCommitmentProgress",
]);
const handlers: string[] = [];
function findHandlers(node: ts.Node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    handlerNames.has(node.name.text)
  ) {
    handlers.push(node.getText(source));
  }
  ts.forEachChild(node, findHandlers);
}
findHandlers(source);
expect(handlers).toHaveLength(handlerNames.size);
const handlerCode = ts.transpileModule(handlers.join("\n"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;

const commitment = {
  id: "commitment-owned",
  title: "Seguimiento sintético",
  status: "IN_PROGRESS",
  progress: 50,
  canUpdate: true,
} as Commitment;

type Filters = {
  page: number;
  status: string;
  search: string;
  isPublic: string;
};
type Setter<T> = T | ((current: T) => T);
function harness(
  update: (
    id: string,
    input: { status?: CommitmentStatus; progress?: number },
  ) => Promise<Commitment>,
  draft = 75,
) {
  const state = {
    filters: {
      page: 4,
      status: "IN_PROGRESS",
      search: "barrio",
      isPublic: "true",
    } as Filters,
    reload: 0,
    mutation: null as string | null,
    error: null as string | null,
    drafts: { [commitment.id]: draft } as Record<string, number>,
    notices: [] as string[],
    focusCalls: 0,
  };
  const scope = {
    updateCommitment: update,
    taskFiltersAfterMutation,
    get mutation() {
      return state.mutation;
    },
    get progressDrafts() {
      return state.drafts;
    },
    setMutation(value: string | null) {
      state.mutation = value;
    },
    setMutationError(value: string | null) {
      state.error = value;
    },
    setCommitmentFilters(value: Setter<Filters>) {
      state.filters =
        typeof value === "function" ? value(state.filters) : value;
    },
    setCommitmentReload(value: Setter<number>) {
      state.reload = typeof value === "function" ? value(state.reload) : value;
    },
    setProgressDrafts(value: Setter<Record<string, number>>) {
      state.drafts = typeof value === "function" ? value(state.drafts) : value;
    },
    commitmentsTabRef: {
      current: {
        focus: () => {
          state.focusCalls += 1;
        },
      },
    },
    readableError: (error: Error) => error.message,
    showNotice: (notice: string) => state.notices.push(notice),
  };
  const actions = runInNewContext(
    `${handlerCode}\n({handleCommitmentStatus, handleCommitmentProgress})`,
    scope,
  ) as {
    handleCommitmentStatus: (
      record: Commitment,
      status: CommitmentStatus,
    ) => Promise<void>;
    handleCommitmentProgress: (record: Commitment) => Promise<void>;
  };
  return { state, ...actions };
}

test("estado de compromiso usa filtros vigentes, reinicia página y reconsulta sin sustituir items", async () => {
  const pending = Promise.withResolvers<Commitment>();
  const calls: unknown[] = [];
  const model = harness(async (id, input) => {
    calls.push({ id, input });
    return pending.promise;
  });
  const saving = model.handleCommitmentStatus(commitment, "AT_RISK");
  model.state.filters = {
    page: 3,
    status: "PLANNED",
    search: "filtro cambiado durante PATCH",
    isPublic: "false",
  };
  pending.resolve({ ...commitment, status: "AT_RISK" });
  await saving;
  expect(calls).toEqual([{ id: commitment.id, input: { status: "AT_RISK" } }]);
  expect(model.state.filters).toEqual({
    page: 1,
    status: "PLANNED",
    search: "filtro cambiado durante PATCH",
    isPublic: "false",
  });
  expect(model.state.reload).toBe(1);
  expect(model.state.focusCalls).toBe(1);
  expect(model.state.mutation).toBeNull();
  expect(model.state.error).toBeNull();
});

test("avance confirmado también reconsulta; no usa respuesta PATCH como página autoritativa", async () => {
  const calls: unknown[] = [];
  const model = harness(async (id, input) => {
    calls.push({ id, input });
    return { ...commitment, progress: 75 };
  });
  await model.handleCommitmentProgress(commitment);
  expect(calls).toEqual([{ id: commitment.id, input: { progress: 75 } }]);
  expect(model.state.reload).toBe(1);
  expect(model.state.filters.page).toBe(1);
  expect(model.state.focusCalls).toBe(1);
  expect(model.state.error).toBeNull();
});

test("PATCH rechazado conserva página y draft, muestra el error y no anuncia un éxito", async () => {
  for (const action of ["status", "progress"]) {
    const model = harness(async () => {
      throw new Error("Permiso revocado por la API");
    });
    if (action === "status")
      await model.handleCommitmentStatus(commitment, "CANCELLED");
    else await model.handleCommitmentProgress(commitment);
    expect(model.state.error).toBe("Permiso revocado por la API");
    expect(model.state.filters.page).toBe(4);
    expect(model.state.reload).toBe(0);
    expect(model.state.focusCalls).toBe(0);
    expect(model.state.drafts[commitment.id]).toBe(75);
    expect(model.state.notices).toEqual([]);
    expect(model.state.mutation).toBeNull();
  }
});

test("permisos, estado sin cambios, cumplimiento sin100 y mutación en curso no envían PATCH", async () => {
  let calls = 0;
  const model = harness(async () => {
    calls += 1;
    return commitment;
  });
  await model.handleCommitmentStatus(
    { ...commitment, canUpdate: false },
    "AT_RISK",
  );
  await model.handleCommitmentProgress({ ...commitment, canUpdate: false });
  await model.handleCommitmentStatus(commitment, "IN_PROGRESS");
  await model.handleCommitmentStatus(commitment, "FULFILLED");
  expect(model.state.error).toContain("100%");
  model.state.mutation = "another-request";
  await model.handleCommitmentStatus(commitment, "AT_RISK");
  await model.handleCommitmentProgress(commitment);
  expect(calls).toBe(0);
  expect(model.state.reload).toBe(0);
});

test("refetch descarta GET antiguo y sustituye tarjeta, total y permisos por el readback nuevo", async () => {
  const pending = Promise.withResolvers<CommitmentPage>();
  let oldSignal: AbortSignal | undefined;
  const previous = createPageRequestState<CommitmentPage>((signal) => {
    oldSignal = signal;
    return pending.promise;
  });
  const before = previous.start();
  const model = harness(async () => ({ ...commitment, status: "CANCELLED" }));
  await model.handleCommitmentStatus(commitment, "CANCELLED");
  expect(model.state.reload).toBe(1);
  previous.stop();
  const refreshed: CommitmentPage = {
    items: [],
    pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
    permissions: { canCreate: false, canReadInternal: false },
  };
  const current = createPageRequestState(async () => refreshed);
  await current.start();
  pending.resolve({
    items: [commitment],
    pagination: { page: 4, limit: 9, total: 28, totalPages: 4 },
    permissions: { canCreate: true, canReadInternal: true },
  });
  await before;
  expect(oldSignal?.aborted).toBe(true);
  expect(previous.getSnapshot().data).toBeNull();
  expect(current.getSnapshot().data).toEqual(refreshed);
  current.stop();
});
