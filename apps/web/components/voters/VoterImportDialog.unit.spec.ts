import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(
  resolve(__dirname, "VoterImportDialog.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("no consulta opciones, historial ni trabajos sin abrir y confirmar acceso", () => {
  expect(source).toContain('usePlanCapability("import")');
  expect(source).toContain(
    "const allowed = open && enabled && importCapability.enabled;",
  );
  expect(source.match(/enabled: allowed/gu)).toHaveLength(3);
  expect(source).not.toContain("localStorage");
  expect(source).not.toContain("sessionStorage");
});

test("distingue plan no incluido de error reintentable", () => {
  expect(source).toContain("Tu plan no incluye importación");
  expect(source).toContain("Reintentar validación del plan");
  expect(source).toContain("onClick={importCapability.refresh}");
  expect(source).toContain('importCapability.status === "error"');
  expect(source).toContain('id="voter-import-plan-status"');
  expect(source).toContain("importCapability.reason");
});
