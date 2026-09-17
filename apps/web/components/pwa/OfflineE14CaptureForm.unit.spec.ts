import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const component = readFileSync(
  resolve(__dirname, "OfflineE14CaptureForm.tsx"),
  "utf8",
);
const panel = readFileSync(resolve(__dirname, "OfflineVaultPanel.tsx"), "utf8");
const warRoom = readFileSync(
  resolve(process.cwd(), "apps/web/app/dashboard/war-room/page.tsx"),
  "utf8",
);

test("the vault exposes a real E-14 form instead of the previous placeholder", () => {
  expect(panel).toContain("<OfflineE14CaptureForm />");
  expect(panel).not.toContain("E-14 offline no disponible todavía");
  expect(component).toContain("Provisionar capacidad E-14");
  expect(component).toContain("Guardar acta cifrada en este dispositivo");
  expect(component).toContain("vault.enqueueE14(input, file");
});

test("destructive vault actions use the accessible global confirmation", () => {
  expect(component).toContain("useConfirmation()");
  expect(panel).toContain("useConfirmation()");
  expect(component).not.toContain("window.confirm");
  expect(panel).not.toContain("window.confirm");
});

test("the form makes SIMULATION/REAL and server receipt semantics explicit", () => {
  expect(component).toContain('"SIMULACRO"');
  expect(component).toContain('"REAL"');
  expect(component).toMatch(/Aún no ha sido recibido por el\s+servidor/);
  expect(component).toContain(
    "“Recibido por el servidor” no significa resultado oficial",
  );
  expect(component).toMatch(/no la radica\s+ante la autoridad electoral/);
  expect(component).toMatch(/La\s+hora del dispositivo no es prueba confiable/);
});

test("the browser picker and visible copy match the strict encrypted-vault policy", () => {
  expect(component).toContain(
    'accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"',
  );
  expect(component).toContain("OFFLINE_E14_MAX_FILE_BYTES");
  expect(component).toContain("OFFLINE_E14_MAX_QUEUE_ENTRIES");
  expect(component).toContain("OFFLINE_E14_MAX_TOTAL_BYTES");
  expect(component).toContain("no se guarda");
  expect(component).toContain("el nombre original");
  expect(component).toMatch(
    /el binario va\s+directo al almacenamiento privado/,
  );
});

test("the form never constructs tenant, captureContext, signed URL or upload token fields", () => {
  expect(component).not.toMatch(/\btenantId\s*:/);
  expect(component).not.toMatch(/\bcaptureContext\s*:/);
  expect(component).not.toMatch(/\buploadUrl\s*:/);
  expect(component).not.toMatch(/\buploadToken\s*:/);
});

test("War Room opens the same encrypted vault through an actionable button", () => {
  expect(warRoom).toContain("Capturar offline");
  expect(warRoom).toContain(
    "window.dispatchEvent(new Event(OFFLINE_VAULT_OPEN_EVENT))",
  );
  expect(warRoom).toContain('type="button"');
});
