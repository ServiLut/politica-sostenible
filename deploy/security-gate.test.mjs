import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { inspectText, credentialPath, forbiddenPath, validateExceptions, applyExceptions, decodeSource, scanRepository, redactLocations } from "./security-gate.mjs";

const path = "apps/api/test/synthetic.spec.ts";
const jwt = payload => [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify(payload)).toString("base64url"), "x".repeat(43)].join(".");

test("secret scan reports location but never credential values", () => {
  const value = ["ghp", "_", "Q".repeat(38)].join("");
  const report = inspectText("first line\n" + value, path);
  assert.deepEqual(report, [{ rule: "github-token", path, line: 2 }]);
  assert.equal(JSON.stringify(report).includes(value), false);
});

test("private keys and provider secrets are blocked in any text file", () => {
  const samples = [
    [["-----BEGIN ", "PRIVATE KEY-----"].join(""), "private-key"],
    [["sb_", "secret_", "K".repeat(25)].join(""), "supabase-secret-key"],
    [["sk-", "proj-", "Q".repeat(50)].join(""), "provider-secret"],
    [["AK", "IA", "Q".repeat(16)].join(""), "aws-access-key"],
    [["sk_", "live_", "Q".repeat(25)].join(""), "stripe-live-secret"],
  ];
  for (const [value, rule] of samples) assert.equal(inspectText(value, "README.md")[0]?.rule, rule);
});

test("privileged and session JWTs are detected; public anon is distinguished", () => {
  assert.equal(inspectText(jwt({ role: "service_role", exp: 1900000000 }), path)[0]?.rule, "privileged-jwt");
  assert.equal(inspectText(jwt({ role: "ADMIN", tenantId: "synthetic", exp: 1900000000 }), path)[0]?.rule, "session-jwt");
  assert.deepEqual(inspectText(jwt({ role: "anon", exp: 1900000000 }), path), []);
});

test("credential URLs include weak passwords and test-prefixed real-looking values", () => {
  for (const password of ["password", "test-" + "Q".repeat(20), "Q".repeat(20)]) {
    const value = "postgresql://" + "account:" + password + "@database.invalid/app";
    assert.equal(inspectText(value, path)[0]?.rule, "credential-in-url");
  }
  assert.deepEqual(inspectText("redis://" + "account:${REDIS_PASSWORD}@cache:6379", path), []);
});

test("hardcoded server secrets do not become acceptable by a test prefix", () => {
  const value = "JWT_SECRET: '" + "test-" + "Q".repeat(32) + "'";
  assert.equal(inspectText(value, path)[0]?.rule, "embedded-runtime-secret");
});

test("unquoted env, YAML, JSON and Redis URLs without username are covered", () => {
  const secret = "Q".repeat(32);
  const key = ["JWT", "SECRET"].join("_");
  for (const line of [key + "=" + secret, key + ": " + secret, JSON.stringify({ [key]: secret }), "redis://:" + secret + "@cache.invalid:6379"]) {
    const report = inspectText(line, path);
    assert.equal(report.length, 1);
    assert.equal(JSON.stringify(report).includes(secret), false);
  }
});

test("frontend public variables use a closed list", () => {
  assert.deepEqual(inspectText("process.env.NEXT_PUBLIC_API_URL", "apps/web/lib/config.ts"), []);
  const value = "process.env." + ["NEXT_PUBLIC", "DATABASE_URL"].join("_");
  assert.equal(inspectText(value, "apps/web/lib/config.ts")[0]?.rule, "unapproved-public-environment");
});

test("credential and generated paths cannot be published", () => {
  for (const name of [".env", "apps/api/.env.local", "backup/prod.key", ".pgpass", "secrets/id_ed25519"]) assert.equal(credentialPath(name), true);
  assert.equal(credentialPath(".env.example"), false);
  for (const name of ["apps/pwa-field/.next/cache/data.bin", "apps/api/prisma/generated/prisma/index.js", ".artifacts/run/receipt.json", "auth.bak/session.json"]) assert.equal(forbiddenPath(name), true);
});

function policy(bytes) {
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), rules: ["credential-in-url"], classification: "synthetic-fixture", reason: "Synthetic test fixture reviewed without contacting any service.", reviewBy: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) };
}

test("a reviewed synthetic exception is bound to content, path and rule", () => {
  const bytes = Buffer.from("synthetic content");
  const exception = policy(bytes);
  validateExceptions([exception]);
  const finding = { path, line: 1, rule: "credential-in-url" };
  assert.deepEqual(applyExceptions([finding], bytes, path, [exception]), []);
  assert.equal(applyExceptions([finding], Buffer.from("changed content"), path, [exception]).length, 1);
  assert.equal(applyExceptions([finding], bytes, "apps/api/live.ts", [exception]).length, 1);
  assert.equal(applyExceptions([{ ...finding, rule: "privileged-jwt" }], bytes, path, [exception]).length, 1);
});

test("wildcards, expired, invalid and overbroad exceptions fail closed", () => {
  const base = policy(Buffer.from("synthetic"));
  for (const change of [
    { path: "apps/**" }, { path: "../outside" }, { path: "apps\\file.ts" },
    { reviewBy: "2000-01-01" }, { reviewBy: "2099-99-99" },
    { sha256: "not-a-hash" }, { classification: "revoked-secret" },
    { rules: ["sensitive-path"] }, { rules: [] }, { reason: "ok" },
  ]) assert.throws(() => validateExceptions([{ ...base, ...change }]), /INVALID_OR_EXPIRED/);
});

test("literal secrets cannot borrow placeholder prefixes or expression fragments", () => {
  const marker = "Q".repeat(32);
  for (const value of ["replace_me" + marker, "your_" + marker, "example_" + marker, marker + "process.env", marker + ".repeat(32)", marker + ".get(", "ci-" + "jwt-secret-with-more-than-thirty-two-bytes"]) {
    const report = inspectText([["JWT", "SECRET"].join("_"), JSON.stringify(value)].join(": "), "apps/api/src/production.config.ts");
    assert.equal(report.length, 1);
    assert.equal(report[0].rule, "embedded-runtime-secret");
  }
  for (const value of [marker + "${ENV}", "replace_me" + marker]) {
    const source = ["postgresql://account:", value, "@database.invalid/app"].join("");
    assert.equal(inspectText(source, path)[0]?.rule, "credential-in-url");
  }
  const key = ["JWT", "SECRET"].join("_");
  assert.deepEqual(inspectText(key + ": process.env." + key, path), []);
  assert.deepEqual(inspectText(key + ': configService.get("' + key + '")', path), []);
});

test("exception expiration uses real calendar dates and a maximum of 31 days", t => {
  t.mock.method(Date, "now", () => Date.UTC(2028, 1, 1));
  const base = policy(Buffer.from("synthetic"));
  validateExceptions([{ ...base, reviewBy: "2028-02-29" }]);
  validateExceptions([{ ...base, reviewBy: "2028-03-03" }]);
  for (const reviewBy of ["2028-02-30", "2028-02-31", "2028-03-04", "2099-12-31"]) {
    assert.throws(() => validateExceptions([{ ...base, reviewBy }]), /INVALID_OR_EXPIRED/);
  }
});

test("environment and configuration reads cannot hide literal fallback secrets", () => {
  const key = ["JWT", "SECRET"].join("_"), literal = JSON.stringify("Q".repeat(40));
  for (const expression of [
    `process.env.${key} || ${literal}`,
    `process.env.${key} ?? ${literal}`,
    `process.env.${key}\n  ?? ${literal}`,
    `configService.get("${key}", ${literal})`,
    `configService.get("${key}") || ${literal}`,
  ]) assert.equal(inspectText(key + ": " + expression, "apps/api/src/production.config.ts")[0]?.rule, "embedded-runtime-secret");
  for (const expression of [`process.env.${key}`, `configService.get("${key}")`]) {
    assert.deepEqual(inspectText(key + ": " + expression + ",\nnext: true", path), []);
  }
});

test("UTF16 LE/BE text is decoded with or without BOM; unknown binary fails closed", () => {
  const source = "JWT_SECRET=" + "Q".repeat(32) + "\n";
  const le = Buffer.from(source, "utf16le"), be = Buffer.from(le).swap16();
  for (const bytes of [le, be, Buffer.concat([Buffer.from([255, 254]), le]), Buffer.concat([Buffer.from([254, 255]), be])]) {
    const decoded = decodeSource(bytes, "runtime.ps1");
    assert.equal(decoded.text, source);
    assert.equal(inspectText(decoded.text, "runtime.ps1")[0]?.rule, "embedded-runtime-secret");
  }
  for (const bytes of [Buffer.from([255, 254, 0]), Buffer.from("text\0" + source), Buffer.from([255, 255, 255])]) {
    assert.throws(() => decodeSource(bytes, "runtime.ps1"), /UNSUPPORTED_SOURCE_ENCODING/);
  }
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
  assert.equal(decodeSource(png, "image.png").encoding, "binary-ascii-literals");
  assert.throws(() => decodeSource(png, "script.ps1"), /UNSUPPORTED_SOURCE_ENCODING/);
  assert.throws(() => decodeSource(Buffer.concat([Buffer.from("A".repeat(2048), "utf16le"), Buffer.from([1, 0])]), "ambiguous.bin"), /UNSUPPORTED_SOURCE_ENCODING/);
});

test("recognized binary signatures retain ASCII credential inspection and archives fail closed", () => {
  const marker = ["ghp", "_", "Q".repeat(38)].join("");
  for (const [name, header] of [
    ["image.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ["module.wasm", Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
    ["report.pdf", Buffer.from("%PDF-1.7\n")],
  ]) {
    const decoded = decodeSource(Buffer.concat([header, Buffer.from(marker)]), name);
    assert.equal(decoded.encoding, "binary-ascii-literals");
    assert.equal(inspectText(decoded.text, name)[0]?.rule, "github-token");
  }
  for (const name of ["document.docx", "sheet.xlsx", "deck.pptx", "archive.zip", "archive.bin"]) {
    assert.throws(() => decodeSource(Buffer.from([80, 75, 3, 4]), name), /UNSCANNED_COMPRESSED_CONTENT/);
  }
  assert.throws(() => decodeSource(Buffer.from([0, 97, 115, 109, 2, 0, 0, 0]), "module.wasm"), /UNSUPPORTED_SOURCE_ENCODING/);
  assert.throws(() => decodeSource(Buffer.alloc(100), "file.js"), /UNSUPPORTED_SOURCE_ENCODING/);
});

test("bounded legacy text decoding preserves ASCII secrets without granting an extension bypass", () => {
  const source = Buffer.from("// versi\u00f3n anterior\n" + ["JWT", "SECRET"].join("_") + "=" + "Q".repeat(32), "latin1");
  const decoded = decodeSource(source, "update.js");
  assert.equal(decoded.encoding, "legacy-ascii-compatible-text");
  assert.equal(inspectText(decoded.text, "update.js")[0]?.rule, "embedded-runtime-secret");
  for (const bytes of [Buffer.concat([source, Buffer.from([0])]), Buffer.concat([source, Buffer.from([129])]), Buffer.concat([source, Buffer.from([1])]), Buffer.alloc(100, 255)]) {
    assert.throws(() => decodeSource(bytes, "update.js"), /UNSUPPORTED_SOURCE_ENCODING/);
  }
  assert.throws(() => decodeSource(source, "unknown.bin"), /UNSUPPORTED_SOURCE_ENCODING/);
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "politica-secret-gate-"));
  const environment = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete environment[key];
  mkdirSync(join(directory, ".nohooks"));
  const run = args => execFileSync("git", ["-c", "core.hooksPath=" + join(directory, ".nohooks"), "-c", "user.name=Synthetic Security Test", "-c", "user.email=fixture@example.invalid", ...args], { cwd: directory, env: environment, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  run(["init", "--quiet"]);
  writeFileSync(join(directory, ".gitignore"), ".nohooks/\n");
  const commit = (message = "Synthetic fixture") => { run(["add", "--all"]); run(["commit", "--quiet", "-m", message]); };
  commit();
  t.after(() => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(target.startsWith(join(resolve(tmpdir()), "politica-secret-gate-")));
    rmSync(target, { recursive: true, force: true });
  });
  return { directory, run, commit, scan: options => scanRepository({ repositoryRoot: directory, history: true, includeUntracked: false, ...options }) };
}

test("history retains every path for a reused blob after deletion and rename", t => {
  const f = fixture(t), content = "REDIS_HOST=cache.invalid\n";
  writeFileSync(join(f.directory, "README.md"), content);
  writeFileSync(join(f.directory, ".env"), content);
  f.commit();
  unlinkSync(join(f.directory, ".env"));
  f.commit();
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "historical-sensitive-path" && finding.path === ".env"));
  assert.ok(report.coverage.historicalPaths > report.coverage.historicalBlobs);
});

test("an exact reviewed blob at one path cannot exempt its historical copy", t => {
  const f = fixture(t), value = "Q".repeat(32), content = Buffer.from("JWT_SECRET=" + value);
  writeFileSync(join(f.directory, "reviewed.spec.ts"), content);
  writeFileSync(join(f.directory, "production.ts"), content);
  f.commit();
  unlinkSync(join(f.directory, "production.ts"));f.commit();
  const exception = { ...policy(content), path: "reviewed.spec.ts", rules: ["embedded-runtime-secret"] };
  const report = f.scan({ exceptions: [exception] });
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "embedded-runtime-secret" && finding.path === "production.ts"));
  assert.equal(report.findings.some(finding => finding.rule === "embedded-runtime-secret" && finding.path === "reviewed.spec.ts"), false);
});

test("commit and annotated tag messages are scanned under opaque locations", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  writeFileSync(join(f.directory, "README.md"), "safe fixture");f.commit("Synthetic commit " + marker);
  f.run(["tag", "-a", "synthetic-tag", "-m", "Synthetic tag " + marker]);
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "github-token" && finding.path.startsWith("[git-commit:")));
  assert.ok(report.findings.some(finding => finding.rule === "github-token" && finding.path.startsWith("[git-tag:")));
  assert.equal(JSON.stringify(report).includes(marker), false);
});

test("historical trees directly referenced by tags retain sensitive paths", t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, ".env"), "SETTING=fixture\n");f.run(["add", ".env"]);
  const tree = f.run(["write-tree"]).trim();
  f.run(["tag", "tree-only", tree]);
  f.run(["reset", "--quiet", "HEAD", "--", ".env"]);unlinkSync(join(f.directory, ".env"));
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "historical-sensitive-path" && finding.path === ".env"));
});

test("working and historical UTF16 credentials cannot be omitted as binary", t => {
  const f = fixture(t), source = "JWT_SECRET=" + "Q".repeat(32);
  writeFileSync(join(f.directory, "runtime.ps1"), Buffer.concat([Buffer.from([255, 254]), Buffer.from(source, "utf16le")]));f.commit();
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "embedded-runtime-secret" && !finding.oid));
  assert.ok(report.findings.some(finding => finding.rule === "embedded-runtime-secret" && finding.oid));
  assert.equal(report.coverage.utf16Files, 2);
});

test("UTF16 prefixes cannot hide ASCII credentials in mixed-encoding tails", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  const le = Buffer.from("A".repeat(2048), "utf16le"), be = Buffer.from(le).swap16();
  const variants = [le, be, Buffer.concat([Buffer.from([255, 254]), le]), Buffer.concat([Buffer.from([254, 255]), be])];
  for (const [index, prefix] of variants.entries()) {
    const bytes = Buffer.concat([prefix, Buffer.from(index % 2 ? "\n" + marker + "\n" : marker)]);
    assert.ok(decodeSource(bytes, "mixed.bin").encoding.startsWith("utf-16"));
    writeFileSync(join(f.directory, `mixed-${index}.bin`), bytes);
  }
  f.commit();
  const report = f.scan();
  assert.equal(report.passed, false);
  const findings = report.findings.filter(finding => finding.rule === "github-token");
  assert.equal(findings.length, 8, "four current and four historical mixed-encoding files");
  assert.equal(findings.filter(finding => finding.oid).length, 4);
  assert.equal(report.coverage.utf16Files, 8);
  assert.equal(JSON.stringify(report).includes(marker), false);
});

test("reports redact credentials embedded in filenames but retain normal locations", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  writeFileSync(join(f.directory, marker + ".key"), "synthetic fixture");f.commit();
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.equal(JSON.stringify(report).includes(marker), false);
  assert.ok(report.findings.some(finding => finding.path.startsWith("[redacted-path:")));
  assert.equal(inspectText(marker, "ordinary-file.ts")[0].path, "ordinary-file.ts");
});

test("innocent file contents do not hide credentials in current or historical filenames", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  const name = marker + ".txt";
  writeFileSync(join(f.directory, name), "harmless fixture");f.commit();
  let report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "github-token" && finding.location === "filename" && !finding.oid));
  unlinkSync(join(f.directory, name));f.commit();report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "github-token" && finding.location === "filename" && finding.oid));
  assert.equal(JSON.stringify(report).includes(marker), false);
});

test("lightweight tag names are inspected without echoing their credentials", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  f.run(["tag", marker]);
  const report = f.scan();
  assert.equal(report.passed, false);
  assert.ok(report.findings.some(finding => finding.rule === "github-token" && finding.path.startsWith("[git-ref:")));
  assert.equal(JSON.stringify(report).includes(marker), false);
});

test("safe history remains green and Git failures expose only a controlled code", t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, "safe.ts"), "export const value = 1;\n");f.commit();
  assert.equal(f.scan().passed, true);
  assert.throws(() => scanRepository({ repositoryRoot: join(f.directory, "missing-secret-like-path") }), error => error.message === "GIT_COMMAND_FAILED" && error.cause === undefined);
  const head = f.run(["rev-parse", "HEAD"]).trim();
  writeFileSync(join(f.directory, ".git", "shallow"), head + "\n");
  assert.throws(() => f.scan(), /INCOMPLETE_SHALLOW_HISTORY/);
});

test("public reporting preserves the decision and coverage while hashing every finding location", () => {
  const report = { passed: false, coverage: { historicalBlobs: 1 }, findings: [{ rule: "github-token", path: "private-location.ts", oid: "a".repeat(40), line: 17 }] };
  const redacted = redactLocations(report);
  assert.equal(redacted.passed, false);
  assert.deepEqual(redacted.coverage, report.coverage);
  assert.deepEqual(Object.keys(redacted.findings[0]).sort(), ["locationSha256", "rule"]);
  assert.match(redacted.findings[0].locationSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(redacted).includes(report.findings[0].path), false);
  assert.equal(JSON.stringify(redacted).includes(report.findings[0].oid), false);
  assert.equal(report.findings[0].line, 17);
});

test("CLI redaction applies identically to stdout and saved JSON without changing failure", t => {
  const f = fixture(t), marker = ["ghp", "_", "Q".repeat(38)].join("");
  writeFileSync(join(f.directory, "incident-location.ts"), marker);f.commit();
  const raw = f.scan();
  mkdirSync(join(f.directory, "deploy"));mkdirSync(join(f.directory, "security"));
  copyFileSync(new URL("./security-gate.mjs", import.meta.url), join(f.directory, "deploy/security-gate.mjs"));
  writeFileSync(join(f.directory, "security/secret-fixtures.json"), "[]");
  const reportPath = join(f.directory, "redacted.json");
  const child = spawnSync(process.execPath, [join(f.directory, "deploy/security-gate.mjs"), "--history", "--tracked-only", "--redact-locations", "--report=" + reportPath], { cwd: f.directory, encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(child.status, 1);
  const stdout = JSON.parse(child.stdout), saved = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.deepEqual(stdout, saved);
  assert.equal(stdout.passed, raw.passed);
  assert.deepEqual(stdout.coverage, raw.coverage);
  for (const finding of stdout.findings) assert.deepEqual(Object.keys(finding).sort(), ["locationSha256", "rule"]);
  for (const value of [marker, "incident-location.ts", ...raw.findings.map(finding => finding.oid).filter(Boolean)]) {
    assert.equal(child.stdout.includes(value), false);
    assert.equal(child.stderr.includes(value), false);
    assert.equal(JSON.stringify(saved).includes(value), false);
  }
});
