import { expect, test } from "@playwright/test";
import { getVisibleNavigationItems } from "./navigation";
import {
  UserRole,
  type BackendUserRole,
  type Tenant,
} from "../types/saas-schema";

const tenant = { type: "CANDIDACY" } as Pick<Tenant, "type">;

function hrefs(
  backendRole: BackendUserRole,
  role: UserRole,
  stage: Parameters<typeof getVisibleNavigationItems>[2],
) {
  return getVisibleNavigationItems({ backendRole, role }, tenant, stage).map(
    ({ href }) => href,
  );
}

test("muestra escrutinios desde Día D hasta CLOSED a roles autorizados", () => {
  for (const stage of ["ELECTION_DAY", "POST_ELECTION", "CLOSED"] as const) {
    expect(hrefs("ADMIN", UserRole.AdminCampana, stage)).toContain(
      "/dashboard/scrutiny",
    );
    expect(hrefs("WITNESS", UserRole.Testigo, stage)).toContain(
      "/dashboard/scrutiny",
    );
  }
});

test("oculta escrutinios antes de Día D y a voluntariado", () => {
  expect(hrefs("ADMIN", UserRole.AdminCampana, "CAMPAIGN")).not.toContain(
    "/dashboard/scrutiny",
  );
  expect(
    hrefs("VOLUNTEER", UserRole.Voluntario, "POST_ELECTION"),
  ).not.toContain("/dashboard/scrutiny");
});
