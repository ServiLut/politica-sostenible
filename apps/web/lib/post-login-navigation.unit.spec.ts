import { expect, test } from "@playwright/test";
import { UserRole, type Tenant, type User } from "../types/saas-schema";
import {
  buildLoginRedirectHref,
  resolvePostLoginDestination,
} from "./post-login-navigation";

const admin: User = {
  id: "admin-a",
  email: "admin@example.test",
  name: "Administración",
  role: UserRole.AdminCampana,
  backendRole: "ADMIN",
};

const campaign: Tenant = {
  id: "tenant-a",
  name: "Campaña verificable",
  slug: "campana-verificable",
  type: "CANDIDACY",
  operationStage: "CAMPAIGN",
};

test("codifica pathname y query completos dentro de next", () => {
  const href = buildLoginRedirectHref(
    "/dashboard/tasks",
    "?view=tasks&entityId=task_01-A",
  );
  const url = new URL(href, "https://app.example.test");

  expect(url.pathname).toBe("/iniciar-sesion");
  expect(url.searchParams.get("next")).toBe(
    "/dashboard/tasks?view=tasks&entityId=task_01-A",
  );
});

test("conserva el deep-link autorizado completo después del login", () => {
  expect(
    resolvePostLoginDestination(
      "/dashboard/tasks?view=tasks&entityId=task_01-A",
      admin,
      campaign,
    ),
  ).toBe("/dashboard/tasks?view=tasks&entityId=task_01-A");

  expect(
    resolvePostLoginDestination(
      "/dashboard/profile?tab=security",
      admin,
      campaign,
    ),
  ).toBe("/dashboard/profile?tab=security");
});

test("rechaza destinos externos, protocol-relative, fragmentos y caracteres ambiguos", () => {
  const unsafeDestinations = [
    "https://evil.example/dashboard/tasks",
    "//evil.example/dashboard/tasks",
    "/\\evil.example/dashboard/tasks",
    "/dashboard/tasks#//evil.example",
    "/dashboard/tasks\n?view=tasks",
    "javascript:alert(1)",
  ];

  for (const destination of unsafeDestinations) {
    expect(resolvePostLoginDestination(destination, admin, campaign)).toBe(
      "/dashboard/executive",
    );
  }
});

test("descarta rutas inexistentes o no autorizadas para el rol y tenant", () => {
  const financeManager: User = {
    ...admin,
    id: "finance-a",
    role: UserRole.GerenteFinanzas,
    backendRole: "FINANCE_MANAGER",
  };

  expect(
    resolvePostLoginDestination(
      "/dashboard/team?view=detail&entityId=user-a",
      financeManager,
      campaign,
    ),
  ).toBe("/dashboard/finance");
  expect(
    resolvePostLoginDestination(
      "/dashboard/no-existe?view=detail&entityId=resource-a",
      admin,
      campaign,
    ),
  ).toBe("/dashboard/executive");
});

test("el cambio obligatorio de contraseña prevalece sobre cualquier next", () => {
  expect(
    resolvePostLoginDestination(
      "/dashboard/tasks?view=tasks&entityId=task-a",
      { ...admin, mustChangePassword: true },
      campaign,
    ),
  ).toBe("/dashboard/profile");
});
