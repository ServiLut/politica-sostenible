import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiRequire = createRequire(join(root, "apps/api/package.json"));
const jestRequire = createRequire(apiRequire.resolve("jest/package.json"));
const coreRequire = createRequire(jestRequire.resolve("@jest/core/package.json"));
const transformRequire = createRequire(coreRequire.resolve("@jest/transform/package.json"));
const istanbulRequire = createRequire(transformRequire.resolve("babel-plugin-istanbul/package.json"));
const configRequire = createRequire(istanbulRequire.resolve("@istanbuljs/load-nyc-config/package.json"));
const { loadNycConfig } = istanbulRequire("@istanbuljs/load-nyc-config");

test("coverage loader uses the reviewed YAML parser without sprintf-js", () => {
  const yamlManifest = configRequire("js-yaml/package.json");
  assert.equal(yamlManifest.version, "4.3.2");
  const yamlRequire = createRequire(configRequire.resolve("js-yaml/package.json"));
  const argumentManifest = yamlRequire("argparse/package.json");
  assert.equal(argumentManifest.version, "2.0.1");
  assert.equal(argumentManifest.dependencies?.["sprintf-js"], undefined);
});

test("coverage YAML preserves relative extends and the loader's existing precedence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "politica-coverage-yaml-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "synthetic-coverage-fixture", private: true }));
    writeFileSync(join(directory, "base.yaml"), [
      "include:", "  - src/**/*.ts", "exclude:", "  - src/**/*.spec.ts",
      "all: true", "branches: 85", "statements: 80", "report-dir: ./coverage-fixture", "",
    ].join("\n"));
    writeFileSync(join(directory, ".nycrc.yaml"), [
      "extends: ./base.yaml", "statements: 90", "reporter:", "  - json-summary", "",
    ].join("\n"));

    const config = await loadNycConfig({ cwd: directory });
    assert.deepEqual(config.include, ["src/**/*.ts"]);
    assert.deepEqual(config.exclude, ["src/**/*.spec.ts"]);
    assert.equal(config.all, true);
    assert.equal(config.branches, 85);
    // load-nyc-config 1.1.0 assigns extended config after the child config.
    // Preserve that existing behavior rather than changing its merge contract.
    assert.equal(config.statements, 80);
    assert.equal(config.reportDir, "./coverage-fixture");
    assert.deepEqual(config.reporter, ["json-summary"]);

    // Unsupported executable tags must fail as configuration errors.
    writeFileSync(join(directory, ".nycrc.yaml"), "value: !!js/function 'function () { return 1; }'\n");
    await assert.rejects(loadNycConfig({ cwd: directory }), /unknown tag/);
  } finally {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(target.startsWith(join(resolve(tmpdir()), "politica-coverage-yaml-")));
    rmSync(target, { recursive: true, force: true });
  }
});
