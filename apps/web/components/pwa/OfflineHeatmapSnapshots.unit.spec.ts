import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const component = readFileSync(
  resolve(__dirname, "OfflineHeatmapSnapshots.tsx"),
  "utf8",
);
const panel = readFileSync(resolve(__dirname, "OfflineVaultPanel.tsx"), "utf8");
const provider = readFileSync(
  resolve(process.cwd(), "apps/web/context/offline-vault.tsx"),
  "utf8",
);

test("el visor se alimenta solo de snapshots validados de la bóveda", () => {
  expect(panel).toContain("<OfflineHeatmapSnapshots");
  expect(panel).toContain("snapshots={vault.heatmapSnapshots}");
  expect(provider).toContain("listOfflineHeatmapSnapshots(session)");
  expect(component).not.toMatch(/\bfetch\s*\(/);
  expect(component).not.toMatch(/\bapiRequest\s*\(/);
});

test("el diálogo de bóveda contiene foco, restaura el disparador y no cierra ocupado", () => {
  expect(panel).toContain("useAccessibleDialog({");
  expect(panel).toContain("initialFocusRef: closeButtonRef");
  expect(panel).toContain("returnFocusRef: openButtonRef");
  expect(panel).toContain("closeOnEscape: !vault.busy");
  expect(panel).toContain("if (vault.busy) return;");
  expect(panel).toContain("disabled={vault.busy}");
  expect(panel).toContain("hidden={open}");
  expect(panel).toContain('aria-controls="offline-vault-dialog"');
});

test("la bóveda solicita persistencia y advierte cuando no fue concedida", () => {
  expect(provider).toContain("requestOfflineVaultStoragePersistence()");
  expect(provider).toContain("inspectOfflineVaultStoragePersistence()");
  expect(panel).toContain('vault.storagePersistence === "UNSUPPORTED"');
  expect(panel).toContain("no concedió almacenamiento persistente");
  expect(panel).toContain("podrían eliminar sus copias locales");
});

test("el visor advierte corte, estado offline y posible desactualización", () => {
  expect(component).toContain("MODO OFFLINE");
  expect(component).toContain("Corte del servidor:");
  expect(component).toContain("Pueden estar");
  expect(component).toContain("desactualizadas");
  expect(component).toContain("abrirlas no consulta al servidor");
  expect(component).toContain('aria-expanded={expanded}');
});

test("el visor no muestra identificadores internos ni inventa datos protegidos", () => {
  expect(component).not.toMatch(/>\s*\{item\.id\}\s*</);
  expect(component).toContain('item.suppressed ? "Dato protegido"');
  expect(component).toContain("selected.response.privacy.rule");
  expect(component).toContain("partición de tenant y usuario");
});
