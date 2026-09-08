import assert from "node:assert/strict";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  prepareStandaloneAssets,
  runStandaloneServer,
} from "./run-web-standalone.mjs";

test("prepara public y static dentro del artefacto standalone sin conservar archivos obsoletos", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "politica-standalone-"));
  const webRoot = join(fixtureRoot, "apps", "web");
  const standaloneAppRoot = join(webRoot, ".next", "standalone", "apps", "web");

  try {
    mkdirSync(join(webRoot, "public"), { recursive: true });
    mkdirSync(join(webRoot, ".next", "static"), { recursive: true });
    mkdirSync(join(standaloneAppRoot, "public"), { recursive: true });
    mkdirSync(join(standaloneAppRoot, ".next", "static"), {
      recursive: true,
    });
    writeFileSync(join(webRoot, "public", "manifest.json"), "public-current");
    writeFileSync(
      join(webRoot, ".next", "static", "chunk.js"),
      "static-current",
    );
    writeFileSync(join(standaloneAppRoot, "server.js"), "// fixture");
    writeFileSync(join(standaloneAppRoot, "public", "stale.txt"), "stale");
    writeFileSync(
      join(standaloneAppRoot, ".next", "static", "stale.js"),
      "stale",
    );

    const serverPath = prepareStandaloneAssets({
      webRoot,
      standaloneAppRoot,
    });

    assert.equal(serverPath, join(standaloneAppRoot, "server.js"));
    assert.equal(
      readFileSync(join(standaloneAppRoot, "public", "manifest.json"), "utf8"),
      "public-current",
    );
    assert.equal(
      readFileSync(
        join(standaloneAppRoot, ".next", "static", "chunk.js"),
        "utf8",
      ),
      "static-current",
    );
    assert.throws(
      () => readFileSync(join(standaloneAppRoot, "public", "stale.txt")),
      { code: "ENOENT" },
    );
    assert.throws(
      () =>
        readFileSync(join(standaloneAppRoot, ".next", "static", "stale.js")),
      { code: "ENOENT" },
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("rechaza un build que no genero el servidor standalone", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "politica-standalone-"));
  const webRoot = join(fixtureRoot, "apps", "web");
  const standaloneAppRoot = join(webRoot, ".next", "standalone", "apps", "web");

  try {
    mkdirSync(join(webRoot, "public"), { recursive: true });
    mkdirSync(join(webRoot, ".next", "static"), { recursive: true });

    assert.throws(
      () => prepareStandaloneAssets({ webRoot, standaloneAppRoot }),
      /servidor standalone de Next\.js no existe/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("arranca el servidor con hostname y puerto locales por defecto", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "politica-standalone-"));
  const serverPath = join(fixtureRoot, "server.js");

  try {
    writeFileSync(
      serverPath,
      "process.exit(process.env.HOSTNAME === '127.0.0.1' && process.env.PORT === '3000' ? 0 : 1);",
    );

    const child = runStandaloneServer(serverPath, {});
    const [code, signal] = await once(child, "exit");

    assert.equal(code, 0);
    assert.equal(signal, null);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
