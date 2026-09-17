import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const workspaceRoot = path.resolve(__dirname, "../../..");

function source(relativePath: string) {
  return readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

test("la versión de términos de acceso existe una sola vez en la política API", () => {
  const authority = source("apps/api/src/auth/public-registration.policy.ts");
  const match = authority.match(
    /PUBLIC_REGISTRATION_TERMS_VERSION\s*=\s*['"]([^'"]+)['"]/,
  );
  expect(match?.[1]).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/);

  const authoritativeVersion = match?.[1] ?? "";
  const consumers = [
    "apps/api/src/auth/auth.service.ts",
    "apps/api/src/auth/dto/register.dto.ts",
    "apps/api/src/team/team.service.ts",
    "apps/api/src/team/dto/accept-team-invitation.dto.ts",
    "apps/web/app/(auth)/registro/page.tsx",
    "apps/web/app/aceptar-invitacion/page.tsx",
    "apps/web/app/terminos/page.tsx",
    "apps/web/lib/team-api.ts",
  ];

  for (const relativePath of consumers) {
    expect(source(relativePath), relativePath).not.toContain(
      authoritativeVersion,
    );
  }
});
