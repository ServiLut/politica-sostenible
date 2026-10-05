import { expect, test } from "@playwright/test";
import { createPageRequestState } from "../../../lib/use-page-request-state";
import { updateTask, type Task } from "../../../lib/work-api";
import type { BackendUserRole } from "../../../types/saas-schema";
import {
  canEditTaskDetails,
  taskEditInput,
  taskEditorDraft,
  taskFiltersAfterMutation,
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
