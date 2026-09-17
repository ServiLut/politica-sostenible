import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "ExportButton.tsx"), "utf8");

test("la exportación permanece bloqueada hasta confirmar la capacidad", () => {
  expect(source).toContain('usePlanCapability("export")');
  expect(source).toContain("if (!capability.enabled) return;");
  expect(source).toContain("disabled={loading || !capability.enabled}");
  expect(source).toContain("Validando plan…");
  expect(source).toContain("Exportación no incluida");
  expect(source).toContain("Exportación no disponible");
});

test("explica el bloqueo, permite revalidar y conserva el 403 autoritativo", () => {
  expect(source).toContain("{capability.reason}");
  expect(source).toContain("onClick={capability.refresh}");
  expect(source).toContain("err.status === 403");
  expect(source).toContain("capability.refresh();");
});
