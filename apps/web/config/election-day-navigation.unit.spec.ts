import { expect, test } from "@playwright/test";
import { getVisibleNavigationItems } from "./navigation";
import { UserRole } from "../types/saas-schema";

test("seguimiento de participación coincide con la etapa habilitada por la API", () => {
  const user = { backendRole: "ADMIN" as const, role: UserRole.AdminCampana };
  const tenant = { type: "CANDIDACY" as const };
  for (const stage of [
    "PRE_CAMPAIGN",
    "CAMPAIGN",
    "ELECTION_PREPARATION",
    "SIMULATION",
    "ELECTION_DAY",
    "POST_ELECTION",
    "CLOSED",
  ] as const) {
    const hrefs = getVisibleNavigationItems(user, tenant, stage).map(
      ({ href }) => href,
    );
    expect(hrefs.includes("/dashboard/dia-d")).toBe(stage === "ELECTION_DAY");
  }
});
