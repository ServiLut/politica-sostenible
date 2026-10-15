import { expect, test } from "@playwright/test";
import { searchNavigation } from "./navigation-search";
import { UserRole } from "../../types/saas-schema";

const admin = { role: UserRole.AdminCampana, backendRole: "ADMIN" as const };
const candidacy = {
  type: "CANDIDACY" as const,
  operationStage: "CAMPAIGN" as const,
};

test("descubre secciones por palabras en cualquier orden y sin exigir tildes", () => {
  expect(
    searchNavigation("  accesos equipo ", admin, candidacy).map(
      (item) => item.href,
    ),
  ).toEqual(["/dashboard/team"]);
  expect(
    searchNavigation("lideres", admin, candidacy).map((item) => item.href),
  ).toEqual(["/dashboard/territory/leaders"]);
  expect(
    searchNavigation("AG", admin, candidacy).map((item) => item.href),
  ).toContain("/dashboard/events");
});

test("ofrece accesos iniciales útiles, limitados y sin duplicados", () => {
  const sections = searchNavigation("", admin, candidacy);
  expect(sections[0].href).toBe("/dashboard/executive");
  expect(sections.map((item) => item.href)).toContain("/dashboard/tasks");
  expect(sections.map((item) => item.href)).toContain("/dashboard/events");
  expect(sections).toHaveLength(6);
  expect(new Set(sections.map((item) => item.href)).size).toBe(sections.length);
});

test("voluntariado no descubre administración ni finanzas aunque conozca el nombre", () => {
  const volunteer = {
    role: UserRole.Voluntario,
    backendRole: "VOLUNTEER" as const,
  };
  expect(searchNavigation("", volunteer, candidacy)[0].href).toBe(
    "/dashboard/captura-territorial",
  );
  expect(searchNavigation("equipo", volunteer, candidacy)).toEqual([]);
  expect(searchNavigation("finan", volunteer, candidacy)).toEqual([]);
  expect(
    searchNavigation("tareas", volunteer, candidacy).map((item) => item.href),
  ).toEqual(["/dashboard/tasks"]);
});

test("respeta tipo de organización y reglas específicas del rol en ese contexto", () => {
  const publicOffice = { type: "PUBLIC_OFFICE" as const };
  expect(searchNavigation("", admin, publicOffice)[0].href).toBe(
    "/dashboard/public-office",
  );
  expect(searchNavigation("calor", admin, publicOffice)).toEqual([]);
  expect(
    searchNavigation("atencion", admin, publicOffice).map((item) => item.href),
  ).toEqual(["/dashboard/cases"]);
  const caseWorker = {
    role: UserRole.Coordinador,
    backendRole: "CASE_WORKER" as const,
  };
  expect(searchNavigation("agenda", caseWorker, candidacy)).toEqual([]);
  expect(
    searchNavigation("agenda", caseWorker, publicOffice).map(
      (item) => item.href,
    ),
  ).toEqual(["/dashboard/events"]);
});

test("la búsqueda no adelanta módulos restringidos por etapa ni presume una etapa ausente", () => {
  expect(searchNavigation("escrutinios", admin, candidacy)).toEqual([]);
  expect(searchNavigation("escrutinios", admin, { type: "CANDIDACY" })).toEqual(
    [],
  );
  expect(
    searchNavigation("escrutinios", admin, {
      ...candidacy,
      operationStage: "POST_ELECTION",
    }).map((item) => item.href),
  ).toEqual(["/dashboard/scrutiny"]);
});

test("sin usuario u organización validados no devuelve secciones", () => {
  expect(searchNavigation("", null, candidacy)).toEqual([]);
  expect(searchNavigation("equipo", admin, null)).toEqual([]);
});
