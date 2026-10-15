import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");

test("la autorización de ruta aplica allowedStages además del rol", () => {
  const stageCheck = source.indexOf("const isCurrentStageAllowed");
  const roleCheck = source.indexOf(
    "canAccessNavigationItem(currentRouteConfig, user, tenant)",
    stageCheck,
  );
  const permissionCheck = source.indexOf(
    "isCurrentContextAllowed && isCurrentStageAllowed",
    roleCheck,
  );

  expect(stageCheck).toBeGreaterThan(-1);
  expect(roleCheck).toBeGreaterThan(stageCheck);
  expect(permissionCheck).toBeGreaterThan(roleCheck);
  expect(source).toContain("currentRouteConfig.allowedStages.includes(stage)");
});

test("explica un bloqueo por etapa sin atribuirlo erróneamente al rol", () => {
  expect(source).toContain(
    "isCurrentContextAllowed && currentRouteConfig?.allowedStages && !isCurrentStageAllowed",
  );
  expect(source).toContain(
    "Esta sección no está habilitada durante la etapa operativa",
  );
});
