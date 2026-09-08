import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "MfaSetup.tsx"), "utf8");

test("un fallo al consultar MFA tiene estado y reintento propios", () => {
  const fetchStatus = source.match(
    /async function fetchStatus\(\)[\s\S]*?\n  }\n\n  async function handleEnable/,
  )?.[0];

  expect(fetchStatus).toBeTruthy();
  expect(fetchStatus).toContain('setState("loading")');
  expect(fetchStatus).toContain('setState("status_error")');
  expect(fetchStatus).not.toContain('setState("not_enabled")');
  expect(source).toContain('state === "status_error"');
  expect(source).toContain("No pudimos consultar tu protección 2FA");
  expect(source).toContain("Reintentar");
  expect(source).toContain("onClick={() => void fetchStatus()}");
});

test("solo confirma la copia despues de que el portapapeles responde", () => {
  const awaitedWrite = source.indexOf(
    "await navigator.clipboard.writeText(secret);",
  );
  const copiedState = source.indexOf('setCopyState("copied")', awaitedWrite);
  const failedState = source.indexOf('setCopyState("failed")', copiedState);

  expect(awaitedWrite).toBeGreaterThan(-1);
  expect(copiedState).toBeGreaterThan(awaitedWrite);
  expect(failedState).toBeGreaterThan(copiedState);
  expect(source).toContain("Clave copiada al portapapeles.");
  expect(source).toContain("No fue posible copiar la clave.");
  expect(source).toContain('role="status"');
  expect(source).toContain('role="alert"');
});

test("exige contraseña actual y cierra toda sesión después de cambiar MFA", () => {
  expect(source).toContain('autoComplete="current-password"');
  expect(source).toContain("await setupMfa(currentPassword)");
  expect(source).toContain(
    'signOut("/iniciar-sesion?securityChanged=mfa-enabled")',
  );
  expect(source).toContain(
    'signOut("/iniciar-sesion?securityChanged=mfa-disabled")',
  );
});
