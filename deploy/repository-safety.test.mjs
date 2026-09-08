import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const REQUIRED_EXCLUSION_PATTERNS = Object.freeze([
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  "*.pgpass",
  ".pgpass",
  ".netrc",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "*.ovpn",
  "**/dist/",
  "**/coverage/",
  "*.old.prisma",
]);

function nonCommentLines(contents) {
  return new Set(
    contents
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

test("Git y Docker excluyen formatos comunes de credenciales", async () => {
  const [gitignore, dockerignore] = await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
  ]);

  for (const [name, contents] of [
    [".gitignore", gitignore],
    [".dockerignore", dockerignore],
  ]) {
    const lines = nonCommentLines(contents);
    for (const pattern of REQUIRED_EXCLUSION_PATTERNS) {
      assert.ok(lines.has(pattern), `${name} debe excluir ${pattern}`);
    }
  }
});

test("el repositorio no versiona credenciales ni backups de autenticación", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const forbidden = stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => path !== ".env.example")
    .filter(
      (path) =>
        /(^|\/)\.env(?:\.|$)/iu.test(path) ||
        /(?:^|\/)(?:\.netrc|\.pgpass|id_(?:rsa|dsa|ecdsa|ed25519))$/iu.test(
          path,
        ) ||
        /\.(?:pem|key|p12|pfx|jks|keystore|pgpass|ovpn)$/iu.test(path) ||
        path.startsWith("auth.bak/") ||
        /(?:^|\/)(?:dist|coverage)\//u.test(path) ||
        path.endsWith(".old.prisma"),
    )
    .sort();

  assert.deepEqual(
    forbidden,
    [],
    `archivos sensibles versionados: ${forbidden.join(", ")}`,
  );
});
