import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");

test("la autorización de ruta aplica allowedStages además del rol", () => {
  const stageCheck = source.indexOf("const isCurrentStageAllowed");
  const permissionCheck = source.indexOf(
    "isCurrentStageAllowed &&",
    stageCheck,
  );
  const roleCheck = source.indexOf(
    "canAccessNavigationItem(currentRouteConfig, user, tenant)",
    permissionCheck,
  );

  expect(stageCheck).toBeGreaterThan(-1);
  expect(permissionCheck).toBeGreaterThan(stageCheck);
  expect(roleCheck).toBeGreaterThan(permissionCheck);
  expect(source).toContain("currentRouteConfig.allowedStages.includes(stage)");
});

test("explica un bloqueo por etapa sin atribuirlo erróneamente al rol", () => {
  expect(source).toContain(
    "currentRouteConfig?.allowedStages && !isCurrentStageAllowed",
  );
  expect(source).toContain(
    "Esta sección no está habilitada durante la etapa operativa",
  );
});
