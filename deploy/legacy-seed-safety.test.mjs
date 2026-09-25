import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("los cargadores heredados rechazan la ejecución antes de cualquier red o persistencia", async () => {
  for (const name of ["seed-leaders.ps1", "seed-coordinates.js"]) {
    const source = await readFile(new URL(name, root), "utf8");
    assert.match(source, /throw[\s\S]*SEED_HEREDADO_BLOQUEADO/u);
    assert.doesNotMatch(
      source,
      /Invoke-RestMethod|Invoke-WebRequest|https?:\/\//iu,
    );
    assert.doesNotMatch(
      source,
      /require\s*\(|new PrismaClient|prisma\.|fetch\s*\(/u,
    );
  }
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("seed-coordinates.js", root))],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SEED_HEREDADO_BLOQUEADO/u);
});

test(
  "el cargador heredado PowerShell falla sin credenciales ni interacción",
  { skip: process.platform !== "win32" },
  () => {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("seed-leaders.ps1", root)),
      ],
      { encoding: "utf8", timeout: 10_000, windowsHide: true },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SEED_HEREDADO_BLOQUEADO/u);
  },
);
