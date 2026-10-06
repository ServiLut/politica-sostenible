import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createPageRequestState } from "../../../lib/use-page-request-state";
import { updateTask, type Task } from "../../../lib/work-api";
import type { BackendUserRole } from "../../../types/saas-schema";
import {
  canEditTaskDetails,
  createdTaskHref,
  taskEditInput,
  taskEditorDraft,
  taskFiltersAfterMutation,
  workListHref,
} from "./task-editor";

const task: Task = {
  id: "task-edit",
  mode: "PUBLIC_OFFICE",
  title: "Seguimiento verificable",
  description: "Descripción original",
  status: "IN_PROGRESS",
  priority: "HIGH",
  assigneeId: "page-three-user",
  createdById: "author",
  issueCaseId: "case-linked",
  commitmentId: "commitment-linked",
  dueAt: "2026-10-16T03:27:45.000Z",
  completedAt: null,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-05T11:00:00.000Z",
  assignee: {
    id: "page-three-user",
    name: "Responsable fuera de primera página",
    role: "CASE_WORKER",
  },
  createdBy: { id: "author", name: "Autor", role: "ADMIN" },
  issueCase: {
    id: "case-linked",
    reference: "CAS-1",
    title: "Caso",
    status: "OPEN",
  },
  commitment: {
    id: "commitment-linked",
    reference: "CMP-1",
    title: "Compromiso",
    status: "IN_PROGRESS",
  },
};

test("la edición completa coincide con los roles y modos autorizados; gestores de casos sólo estado", () => {
  const roles: BackendUserRole[] = [
    "ADMIN",
    "CAMPAIGN_MANAGER",
    "FINANCE_MANAGER",
    "COMMUNICATIONS_MANAGER",
    "CONSTITUENT_SERVICES_MANAGER",
    "CASE_WORKER",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
    "ZONE_COORDINATOR",
    "WITNESS",
    "VOLUNTEER",
  ];
  expect(roles.filter((role) => canEditTaskDetails(role, "CAMPAIGN"))).toEqual([
    "ADMIN",
    "CAMPAIGN_MANAGER",
    "COMMUNICATIONS_MANAGER",
    "ZONE_COORDINATOR",
  ]);
  expect(
    roles.filter((role) => canEditTaskDetails(role, "PUBLIC_OFFICE")),
  ).toEqual(["ADMIN", "CONSTITUENT_SERVICES_MANAGER"]);
  expect(canEditTaskDetails(undefined, "CAMPAIGN")).toBe(false);
});

test("abrir, modificar y descartar un draft no muta la tarea ni pierde el responsable al reabrir", () => {
  const original = structuredClone(task);
  const draft = taskEditorDraft(task);
  expect(draft.assigneeId).toBe("page-three-user");
  expect(draft.assigneeName).toBe("Responsable fuera de primera página");
  draft.title = "No guardado";
  draft.assigneeId = "another";
  draft.assigneeName = "Otra persona";
  expect(task).toEqual(original);
  expect(taskEditorDraft(task)).toMatchObject({
    title: task.title,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name,
  });
});

test("guardar sin cambios no reescribe fecha, responsable, estado ni vínculos", () => {
  expect(taskEditInput(task, taskEditorDraft(task))).toEqual({});
  const input = taskEditInput(task, {
    ...taskEditorDraft(task),
    title: "  Título corregido  ",
  });
  expect(input).toEqual({ title: "Título corregido" });
  expect(task.dueAt).toBe("2026-10-16T03:27:45.000Z");
});

test("permite quitar campos opcionales sin inventar una eliminación ni un estado nuevo", () => {
  const draft = {
    ...taskEditorDraft(task),
    description: "",
    assigneeId: "",
    assigneeName: "",
    dueDate: "",
    priority: "LOW" as const,
  };
  expect(taskEditInput(task, draft)).toEqual({
    description: null,
    priority: "LOW",
    assigneeId: null,
    dueAt: null,
  });
  const unassigned = {
    ...task,
    assigneeId: null,
    assignee: null,
    dueAt: null,
    description: null,
  };
  expect(taskEditInput(unassigned, taskEditorDraft(unassigned))).toEqual({});
});

test("fecha editada y responsable paginado se conservan en PATCH; la etiqueta no sale a la API", async () => {
  const draft = {
    ...taskEditorDraft(task),
    assigneeId: "selected-page-3",
    assigneeName: "Selección tercera página",
    dueDate: "2026-11-19",
  };
  const input = taskEditInput(task, draft);
  const date = new Date(input.dueAt!);
  expect([
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
  ]).toEqual([2026, 10, 19, 12]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    expect(String(url)).toContain("/tasks/task-edit");
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(String(options?.body))).toEqual({
      assigneeId: "selected-page-3",
      dueAt: input.dueAt,
    });
    return Response.json({
      statusCode: 200,
      message: "Success",
      data: { ...task, ...input },
    });
  };
  try {
    expect((await updateTask(task.id, input)).assigneeId).toBe(
      "selected-page-3",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("título en blanco se rechaza antes de una petición", () => {
  expect(() =>
    taskEditInput(task, { ...taskEditorDraft(task), title: "  " }),
  ).toThrow("Escribe un título");
});

test("al terminar la mutación se conservan los filtros vigentes y se reinicia una página ya vacía", () => {
  const current = {
    page: 4,
    status: "TODO",
    priority: "URGENT",
    search: "filtro cambiado durante PATCH",
    issueCaseId: "linked-case",
  };
  expect(taskFiltersAfterMutation(current)).toEqual({ ...current, page: 1 });
  expect(current.page).toBe(4);
});

test("el readback nuevo sustituye el total filtrado y una respuesta anterior tardía no lo repone", async () => {
  type Result = {
    items: string[];
    pagination: { page: number; total: number; totalPages: number };
  };
  const old = Promise.withResolvers<Result>();
  let oldSignal: AbortSignal | undefined;
  const oldQuery = createPageRequestState((signal) => {
    oldSignal = signal;
    return old.promise;
  });
  const oldPending = oldQuery.start();
  oldQuery.stop();
  const current = createPageRequestState(async () => ({
    items: [],
    pagination: { page: 1, total: 0, totalPages: 0 },
  }));
  await current.start();
  old.resolve({
    items: [task.id],
    pagination: { page: 4, total: 28, totalPages: 4 },
  });
  await oldPending;
  expect(oldSignal?.aborted).toBe(true);
  expect(oldQuery.getSnapshot().data).toBeNull();
  expect(current.getSnapshot().data).toEqual({
    items: [],
    pagination: { page: 1, total: 0, totalPages: 0 },
  });
  current.stop();
});

const creationSource = ts.createSourceFile(
  "page.tsx",
  readFileSync(join(__dirname, "page.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const creationHandlerNames = new Set([
  "handleCreateTask",
  "refreshTasksAfterMutation",
  "showNotice",
  "openCreatedTask",
]);
const creationHandlers: string[] = [];
function collectCreationHandlers(node: ts.Node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    creationHandlerNames.has(node.name.text)
  ) {
    creationHandlers.push(node.getText(creationSource));
  }
  ts.forEachChild(node, collectCreationHandlers);
}
collectCreationHandlers(creationSource);
expect(creationHandlers).toHaveLength(creationHandlerNames.size);
const creationCode = ts.transpileModule(creationHandlers.join("\n"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;

function creationHarness(create: () => Promise<Task>) {
  const state = {
    filters: {
      page: 3,
      search: "otro título",
      status: "DONE",
      priority: "LOW",
    },
    search: "otro título",
    reload: 0,
    notice: null as string | null,
    createdTask: null as Task | null,
    mutation: null as string | null,
    error: null as string | null,
    dialog: "task" as string | null,
    view: "tasks",
    paths: [] as string[],
    draftsReset: 0,
  };
  const setFilters = (
    value:
      | typeof state.filters
      | ((current: typeof state.filters) => typeof state.filters),
  ) => {
    state.filters = typeof value === "function" ? value(state.filters) : value;
  };
  const actions = runInNewContext(
    `${creationCode}\n({handleCreateTask,openCreatedTask,showNotice})`,
    {
      get mutation() {
        return state.mutation;
      },
      get createdTask() {
        return state.createdTask;
      },
      newTask: {
        title: "Borrador del usuario",
        description: "",
        priority: "MEDIUM",
        dueDate: "",
        assigneeId: "assigned-real",
      },
      ownId: "admin-current",
      user: { name: "Administración" },
      linkedCase: null,
      createTask: create,
      createdTaskHref,
      INITIAL_TASK_FILTERS: { page: 1, search: "", status: "", priority: "" },
      taskFiltersAfterMutation,
      setTaskFilters: setFilters,
      setTaskSearch: (value: string) => {
        state.search = value;
      },
      setTaskReload: (value: (current: number) => number) => {
        state.reload = value(state.reload);
      },
      setNewTask: () => {
        state.draftsReset += 1;
      },
      setCreatedTask: (value: Task | null) => {
        state.createdTask = value;
      },
      setNotice: (value: string) => {
        state.notice = value;
      },
      setMutation: (value: string | null) => {
        state.mutation = value;
      },
      setMutationError: (value: string | null) => {
        state.error = value;
      },
      setDialog: (value: string | null) => {
        state.dialog = value;
      },
      setView: (value: string) => {
        state.view = value;
      },
      readableError: (error: Error) => error.message,
      router: {
        push: (path: string) => {
          state.paths.push(path);
        },
      },
    },
  ) as {
    handleCreateTask: (event: { preventDefault: () => void }) => Promise<void>;
    openCreatedTask: () => void;
    showNotice: (message: string) => void;
  };
  return { state, ...actions };
}

test("crear conserva filtros y respuesta real; sólo Ver tarea creada los limpia y abre el ID devuelto", async () => {
  const created = {
    ...task,
    id: "server-id&safe",
    title: "Título confirmado",
    status: "TODO" as const,
  };
  let calls = 0;
  const model = creationHarness(async () => {
    calls += 1;
    return created;
  });
  await model.handleCreateTask({ preventDefault() {} });
  expect(calls).toBe(1);
  expect(model.state.createdTask).toBe(created);
  expect(model.state.notice).toContain("Título confirmado");
  expect(model.state.filters).toEqual({
    page: 1,
    search: "otro título",
    status: "DONE",
    priority: "LOW",
  });
  expect(model.state.paths).toEqual([]);
  expect(model.state.dialog).toBeNull();
  model.openCreatedTask();
  expect(calls).toBe(1);
  expect(model.state.filters).toEqual({
    page: 1,
    search: "",
    status: "",
    priority: "",
  });
  expect(model.state.search).toBe("");
  expect(model.state.paths).toEqual([
    "/dashboard/tasks?view=tasks&entityId=server-id%26safe&issueCaseId=case-linked",
  ]);
  model.showNotice("Otra operación completada");
  expect(model.state.createdTask).toBeNull();
});

test("alta rechazada conserva borrador y filtros sin inventar confirmación ni vínculo", async () => {
  const model = creationHarness(async () => {
    throw new Error("Permiso revocado");
  });
  await model.handleCreateTask({ preventDefault() {} });
  expect(model.state.error).toBe("Permiso revocado");
  expect(model.state.createdTask).toBeNull();
  expect(model.state.notice).toBeNull();
  expect(model.state.draftsReset).toBe(0);
  expect(model.state.dialog).toBe("task");
  expect(model.state.filters.page).toBe(3);
  expect(model.state.reload).toBe(0);
  model.openCreatedTask();
  expect(model.state.paths).toEqual([]);
});

test("el enlace de creación usa el ID persistido y sólo añade caso si existe", () => {
  expect(createdTaskHref({ id: "real-id", issueCaseId: null })).toBe(
    "/dashboard/tasks?view=tasks&entityId=real-id",
  );
  const href = new URL(
    createdTaskHref({ id: "id&safe", issueCaseId: "case?private" }),
    "https://app.test",
  );
  expect(href.searchParams.get("entityId")).toBe("id&safe");
  expect(href.searchParams.get("issueCaseId")).toBe("case?private");
  expect(href.searchParams.has("create")).toBe(false);
});

test("Ver todas sale del detalle sin perder el caso ni abrir de nuevo el formulario", () => {
  for (const view of ["tasks", "commitments"] as const) {
    for (const issueCaseId of [null, "authorized-case"]) {
      const href = new URL(workListHref(view, issueCaseId), "https://app.test");
      expect(href.pathname).toBe("/dashboard/tasks");
      expect(href.searchParams.get("view")).toBe(view);
      expect(href.searchParams.get("issueCaseId")).toBe(issueCaseId);
      expect([...href.searchParams.keys()].sort()).toEqual(
        issueCaseId ? ["issueCaseId", "view"] : ["view"],
      );
    }
  }
});
