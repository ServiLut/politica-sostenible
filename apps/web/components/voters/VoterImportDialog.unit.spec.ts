import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "VoterImportDialog.tsx"), "utf8");

test("no sondea la plantilla de importación antes de confirmar el plan", () => {
  expect(source).toContain('usePlanCapability("import")');
  const accessFunction = source.match(
    /const checkAccess = useCallback\([\s\S]*?\n  \);\n\n  useEffect/,
  )?.[0];

  expect(accessFunction).toBeTruthy();
  expect(accessFunction?.indexOf("if (!importCapability.enabled) return;")).toBeLessThan(
    accessFunction?.indexOf("getVoterImportTemplate(signal)") ?? -1,
  );
  expect(source).toContain("if (!enabled || !importCapability.enabled) return;");
});

test("distingue plan no incluido de error reintentable", () => {
  expect(source).toContain("Tu plan no incluye importación");
  expect(source).toContain("Reintentar validación del");
  expect(source).toContain("onClick={importCapability.refresh}");
  expect(source).toContain("!importCapability.enabled ||");
});
