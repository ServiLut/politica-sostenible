import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
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
const GENERATED_SOURCE_DIRECTORIES = new Set([
  ".next",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function nonCommentLines(contents) {
  return new Set(
    contents
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
          return GENERATED_SOURCE_DIRECTORIES.has(entry.name)
            ? []
            : sourceFiles(path);
        }
        if (
          entry.isFile() &&
          /\.(?:ts|tsx)$/u.test(entry.name) &&
          !/\.(?:spec|test)\.(?:ts|tsx)$/u.test(entry.name)
        ) {
          return [path];
        }
        return [];
      }),
    )
  ).flat();
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

test("Next.js permanece como capa de presentacion sin Prisma ni Server Actions", async () => {
  // Inspect the working candidate, including newly-created files that have not
  // been staged yet. `git ls-files` made this guard blind during development,
  // exactly when an agent can accidentally introduce a forbidden dependency.
  const sourcePaths = [
    ...(await sourceFiles(`${PROJECT_ROOT}/apps/web`)),
    `${PROJECT_ROOT}/apps/web/package.json`,
  ];
  const violations = [];

  for (const path of sourcePaths) {
    const contents = await readFile(path, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (contents === null) continue;
    if (
      /(?:from\s+|require\s*\()['"](?:@prisma\/client|[^'"]*generated\/prisma)/u.test(
        contents,
      ) ||
      /(?:^|\r?\n)\s*["']use server["'];?/u.test(contents)
    ) {
      violations.push(
        path.slice(PROJECT_ROOT.length + 1).replaceAll("\\", "/"),
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `codigo de persistencia prohibido en Next.js: ${violations.join(", ")}`,
  );
});

test("la aplicacion no contiene texto de produccion con UTF-8 corrompido", async () => {
  const files = (
    await Promise.all([
      sourceFiles(`${PROJECT_ROOT}/apps/api/src`),
      sourceFiles(`${PROJECT_ROOT}/apps/web`),
    ])
  ).flat();
  const violations = [];

  for (const path of files) {
    const contents = await readFile(path, "utf8");
    if (/[ÃÂ]|â(?:€|€¦|€™|€œ|€|†|”)/u.test(contents)) {
      violations.push(
        path.slice(PROJECT_ROOT.length + 1).replaceAll("\\", "/"),
      );
    }
  }

  assert.deepEqual(
    violations.sort(),
    [],
    `texto visible con mojibake: ${violations.join(", ")}`,
  );
});

test("Docker y pnpm fijan herramientas y scripts de instalacion revisados", async () => {
  const [packageJsonContents, workspace, ...dockerfiles] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/Dockerfile", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonContents);
  const turboVersion = packageJson.devDependencies?.turbo;
  const pnpmSpecification = packageJson.packageManager;

  assert.match(turboVersion, /^\d+\.\d+\.\d+$/u);
  assert.match(
    pnpmSpecification,
    /^pnpm@\d+\.\d+\.\d+\+sha512\.[a-f0-9]{128}$/u,
  );
  for (const dockerfile of dockerfiles) {
    assert.match(
      dockerfile,
      new RegExp(
        `TURBO_TELEMETRY_DISABLED=1 pnpm dlx --allow-build= turbo@${turboVersion.replaceAll(".", "\\.")} prune`,
      ),
    );
    const corepackCommands = [
      ...dockerfile.matchAll(/corepack prepare ([^\s]+) --activate/gu),
    ];
    assert.ok(corepackCommands.length > 0);
    for (const [, specification] of corepackCommands) {
      assert.equal(specification, pnpmSpecification);
    }
  }

  assert.match(workspace, /^strictDepBuilds: true$/mu);
  assert.match(workspace, /^updateNotifier: false$/mu);
  const allowBuildsBlock = workspace.match(
    /^allowBuilds:\r?\n([\s\S]*?)^strictDepBuilds: true$/mu,
  );
  assert.ok(allowBuildsBlock, "no se encontro el bloque allowBuilds cerrado");
  const allowBuildLines = allowBuildsBlock[1]
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
  const allowBuildEntries = allowBuildLines.map((line) => {
    const entry = line.match(/^  (?:(?:"([^"]+)")|([^:]+)): (true|false)$/u);
    assert.ok(entry, `entrada allowBuilds invalida: ${line}`);
    return [entry[1] ?? entry[2], entry[3] === "true"];
  });
  assert.equal(
    new Set(allowBuildEntries.map(([dependency]) => dependency)).size,
    allowBuildEntries.length,
    "allowBuilds contiene dependencias duplicadas",
  );
  assert.deepEqual(Object.fromEntries(allowBuildEntries), {
    "@prisma/engines@7.9.1": true,
    "@scarf/scarf": false,
    "bcrypt@6.0.0": true,
    "msgpackr-extract@3.0.4": true,
    prisma: false,
    "unrs-resolver@1.11.1": true,
  });
});

test("la imagen de produccion conserva el cliente Redis requerido por BullMQ", async () => {
  const [apiPackageContents, lockfile] = await Promise.all([
    readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"),
    readFile(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"),
  ]);
  const apiPackage = JSON.parse(apiPackageContents);

  assert.match(apiPackage.dependencies?.bullmq ?? "", /^\^?6\./u);
  assert.match(apiPackage.dependencies?.ioredis ?? "", /^\^?[56]\./u);
  const apiImporter = lockfile.match(
    /^  apps\/api:\r?\n([\s\S]*?)(?=^  [^ ].*:\r?$|^packages:)/mu,
  );
  assert.ok(apiImporter, "pnpm-lock no contiene el importer apps/api");
  assert.match(apiImporter[1], /^      ioredis:\r?$/mu);
  assert.match(lockfile, /^  ioredis@(?:5|6)\./mu);
});

test("Prisma y la integracion fisica confinan SQL directo al esquema de la aplicacion", async () => {
  const [prismaService, workflow] = await Promise.all([
    readFile(
      new URL("../apps/api/src/prisma/prisma.service.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  ]);

  assert.match(
    prismaService,
    /options:\s*resolveDatabaseSearchPathOptions\(schema\)/u,
  );
  assert.match(
    prismaService,
    /return `-c search_path="\$\{schema\}",pg_catalog`/u,
  );

  const physicalDatabaseUrls = [
    ...workflow.matchAll(/^\s+TEST_DATABASE_URL:\s*(\S+)$/gmu),
  ].map((match) => match[1]);
  assert.ok(
    physicalDatabaseUrls.length > 0,
    "CI debe ejecutar las pruebas PostgreSQL fisicas",
  );
  for (const databaseUrl of physicalDatabaseUrls) {
    assert.match(databaseUrl, /[?&]schema=politica-sostenible(?:&|$)/u);
    assert.doesNotMatch(databaseUrl, /[?&]schema=public(?:&|$)/u);
  }
});

test("las imagenes y acciones externas son inmutables y configuran su renovacion", async () => {
  const [workflow, dependabot, ...dockerfiles] = await Promise.all([
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/dependabot.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/Dockerfile", import.meta.url), "utf8"),
  ]);
  const pinnedNodeImage = /node:22-alpine@sha256:[a-f0-9]{64}/u;

  for (const dockerfile of dockerfiles) {
    const externalStages = dockerfile
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("FROM node:"));
    assert.ok(externalStages.length > 0);
    for (const stage of externalStages) assert.match(stage, pinnedNodeImage);
  }
  assert.match(dockerfiles[0], /^ENV NEXT_TELEMETRY_DISABLED=1$/mu);
  assert.match(dockerfiles[2], /^ENV NEXT_TELEMETRY_DISABLED=1$/mu);

  assert.doesNotMatch(workflow, /ubuntu-latest/u);
  assert.equal(
    [...workflow.matchAll(/^\s+NEXT_TELEMETRY_DISABLED: "1"$/gmu)].length,
    2,
  );
  assert.equal(
    [
      ...workflow.matchAll(
        /^\s*image: redis:7\.4-alpine@sha256:[a-f0-9]{64}$/gmu,
      ),
    ].length,
    2,
  );
  assert.equal(
    [...workflow.matchAll(/^\s+TURBO_TELEMETRY_DISABLED: "1"$/gmu)].length,
    2,
  );
  assert.equal(
    [
      ...workflow.matchAll(
        /^\s*image: postgres:16-alpine@sha256:[a-f0-9]{64}$/gmu,
      ),
    ].length,
    2,
  );
  const actionReferences = [
    ...workflow.matchAll(/^\s*- uses: ([^\s#]+)/gmu),
  ].map((match) => match[1]);
  assert.ok(actionReferences.length > 0);
  for (const actionReference of actionReferences) {
    assert.match(actionReference, /@[a-f0-9]{40}$/u);
  }

  assert.match(dependabot, /package-ecosystem: "npm"/u);
  assert.match(dependabot, /package-ecosystem: "github-actions"/u);
  for (const directory of ["/", "/apps/api", "/apps/web"]) {
    assert.ok(
      dependabot.includes(`directory: "${directory}"`),
      `Dependabot no cubre ${directory}`,
    );
  }
});
