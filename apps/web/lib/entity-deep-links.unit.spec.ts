import { expect, test } from "@playwright/test";
import {
  buildSearchResultHref,
  readEntityDeepLink,
} from "./entity-deep-links";

test("crea deep-links por recurso sin aceptar tenant ni mode del cliente", () => {
  const links = [
    buildSearchResultHref("Voters", "voter-a"),
    buildSearchResultHref("Users", "user-a"),
    buildSearchResultHref("Proposals", "proposal-a"),
  ].map((href) => new URL(href, "http://localhost"));

  expect(
    links.map((url) => ({
      pathname: url.pathname,
      view: url.searchParams.get("view"),
      entityId: url.searchParams.get("entityId"),
      tenantId: url.searchParams.get("tenantId"),
      mode: url.searchParams.get("mode"),
    })),
  ).toEqual([
    {
      pathname: "/dashboard/votantes",
      view: "detail",
      entityId: "voter-a",
      tenantId: null,
      mode: null,
    },
    {
      pathname: "/dashboard/team",
      view: "detail",
      entityId: "user-a",
      tenantId: null,
      mode: null,
    },
    {
      pathname: "/dashboard/proposals",
      view: "detail",
      entityId: "proposal-a",
      tenantId: null,
      mode: null,
    },
  ]);
});

test("solo acepta un identificador estable y una vista de detalle", () => {
  expect(readEntityDeepLink("?view=detail&entityId=resource_01-A")).toBe(
    "resource_01-A",
  );
  expect(readEntityDeepLink("?view=list&entityId=resource-a")).toBeNull();
  expect(
    readEntityDeepLink("?view=detail&entityId=one&entityId=two"),
  ).toBeNull();
  expect(readEntityDeepLink("?view=detail&entityId=../secret")).toBeNull();
  expect(() => buildSearchResultHref("Users", "invalid/id")).toThrow(
    "identificador inválido",
  );
});
