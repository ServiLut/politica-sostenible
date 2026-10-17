import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX_BLOB = 32 * 1024 * 1024;
const PUBLIC_ENV = new Set(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_REVISION", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

function git(args, input, root = ROOT) {
  try {
    return execFileSync("git", args, { cwd: root, input, maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    // Child-process errors can contain source paths, arguments and stderr.
    throw new Error("GIT_COMMAND_FAILED");
  }
}
function lineNumber(text, offset) { return text.slice(0, offset).split("\n").length; }
function isPlaceholder(value) {
  // Only a complete environment reference is an expression. Descriptive or
  // CI-looking literal credentials still require a reviewed path+content hash.
  return /^\$\{[A-Z_][A-Z0-9_]*\}$/u.test(value);
}

function expressionEndsHere(remainder) {
  const sameLine = remainder.split(/\r?\n/u, 1)[0].trimStart();
  if (/^[,;}]/u.test(sameLine)) return true;
  if (sameLine.length) return false;
  // A line break does not end a nullish/logical fallback expression.
  return !/^(?:\?\?|\|\||&&|\?)/u.test(remainder.trimStart());
}

function inspectRaw(text, path) {
  const findings = [];
  const add = (rule, offset) => findings.push({ rule, path, line: lineNumber(text, offset) });
  const patterns = [
    ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/gu],
    ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/gu],
    ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu],
    ["stripe-live-secret", /\bsk_live_[A-Za-z0-9]{16,}\b/gu],
    ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/gu],
    ["provider-secret", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/gu],
  ];
  for (const [rule, pattern] of patterns) for (const match of text.matchAll(pattern)) add(rule, match.index);
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}\b/gu)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") add("privileged-jwt", match.index);
      else if (payload.role !== "anon" && (payload.exp || payload.tenantId || payload.tenant_id)) add("session-jwt", match.index);
    } catch { /* Not a JWT: no content is logged. */ }
  }
  for (const match of text.matchAll(/(?:postgres(?:ql)?|rediss?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/"'`]*:([^\s@"'`]+)@[^\s"'`]+/giu)) {
    const password = match[1];
    if (!isPlaceholder(password)) add("credential-in-url", match.index);
  }
  for (const match of text.matchAll(/["']?\b(JWT_SECRET|CONSENT_IP_SALT|OFFLINE_SYNC_HMAC_SECRET|SUPABASE_SERVICE_ROLE_KEY|MFA_TOTP_ENCRYPTION_KEY|DATABASE_PASSWORD|POSTGRES_PASSWORD)["']?\s*[:=]\s*(?:["']([^"'\r\n]{16,})["']|([^\s,"'`#;{}]{16,}))/gu)) {
    const value = match[2] ?? match[3];
    const remainder = text.slice(match.index + match[0].length);
    const getterArgument = new RegExp('^\\s*["\']' + match[1] + '["\']\\s*\\)!?').exec(remainder);
    const expression = match[2] === undefined && (
      (/^process\.env\.[A-Z_][A-Z0-9_]*!?$/u.test(value) && expressionEndsHere(remainder)) ||
      (/^(?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.get\($/u.test(value) && getterArgument && expressionEndsHere(remainder.slice(getterArgument[0].length)))
    );
    if (!isPlaceholder(value) && !expression) add("embedded-runtime-secret", match.index);
  }
  if (/^apps\/web\/(?!.*\.(?:spec|test)\.)/u.test(path)) {
    for (const match of text.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+\b/gu)) if (!PUBLIC_ENV.has(match[0])) add("unapproved-public-environment", match.index);
  }
  return findings;
}

function reportPath(path) {
  if (/[\u0000-\u001f\u007f]/u.test(path) || inspectRaw(path, "[filename]").length > 0) {
    return `[redacted-path:${createHash("sha256").update(path).digest("hex")}]`;
  }
  return path;
}

/** Findings expose ordinary locations, but never matched values in filenames. */
export function inspectText(text, path) {
  return inspectRaw(text, path).map(finding => ({ ...finding, path: reportPath(path) }));
}

export function credentialPath(path) {
  return path !== ".env.example" && (
    /(?:^|\/)\.env(?:\.|$)/iu.test(path) ||
    /\.(?:pem|key|p12|pfx|jks|keystore|pgpass|ovpn)$/iu.test(path) ||
    /(?:^|\/)(?:\.netrc|\.pgpass|id_rsa|id_dsa|id_ecdsa|id_ed25519)$/iu.test(path)
  );
}
export function forbiddenPath(path) {
  return credentialPath(path) || /(?:^|\/)(?:auth\.bak|\.artifacts|node_modules|dist|coverage|\.next)\//u.test(path) || path.startsWith("apps/api/prisma/generated/");
}

export function validateExceptions(entries) {
  if (!Array.isArray(entries)) throw new Error("INVALID_SECRET_EXCEPTION_POLICY");
  const now = Date.now();
  const today = now - now % 86400000;
  const latest = today + 31 * 86400000;
  for (const e of entries) {
    const reviewTime = Date.parse(e?.reviewBy + "T00:00:00Z");
    const validDate = Number.isFinite(reviewTime) && new Date(reviewTime).toISOString().slice(0, 10) === e?.reviewBy;
    if (!e || !/^[a-f0-9]{64}$/u.test(e.sha256) || typeof e.path !== "string" || /[\\*?]/u.test(e.path) || e.path.startsWith("/") || e.path.split("/").includes("..") ||
      !Array.isArray(e.rules) || !e.rules.length || e.rules.some(rule => !["credential-in-url", "embedded-runtime-secret", "supabase-secret-key", "privileged-jwt", "session-jwt", "provider-secret", "github-token", "aws-access-key", "stripe-live-secret", "private-key"].includes(rule)) || typeof e.reason !== "string" || e.reason.length < 20 ||
      e.classification !== "synthetic-fixture" || !/^\d{4}-\d{2}-\d{2}$/u.test(e.reviewBy) || !validDate || reviewTime < today || reviewTime > latest) {
      throw new Error("INVALID_OR_EXPIRED_SECRET_EXCEPTION");
    }
  }
}

export function applyExceptions(findings, bytes, path, exceptions) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return findings.filter((f) => !exceptions.some((e) => e.path === path && e.sha256 === digest && e.rules.includes(f.rule)));
}

function utf8(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("INVALID_GIT_TEXT_ENCODING"); }
}

function knownBinary(bytes, path) {
  const signature = bytes.subarray(0, 12);
  return (/\.png$/iu.test(path) && signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (/\.jpe?g$/iu.test(path) && signature[0] === 255 && signature[1] === 216 && signature[2] === 255) ||
    (/\.gif$/iu.test(path) && /^(?:GIF87a|GIF89a)$/u.test(signature.subarray(0, 6).toString("ascii"))) ||
    (/\.webp$/iu.test(path) && signature.subarray(0, 4).toString("ascii") === "RIFF" && signature.subarray(8, 12).toString("ascii") === "WEBP") ||
    (/\.ico$/iu.test(path) && signature.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) ||
    (/\.pdf$/iu.test(path) && signature.subarray(0, 5).toString("ascii") === "%PDF-") ||
    (/\.woff2?$/iu.test(path) && ["wOFF", "wOF2"].includes(signature.subarray(0, 4).toString("ascii"))) ||
    (/\.(?:ttf|otf)$/iu.test(path) && (signature.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || signature.subarray(0, 4).toString("ascii") === "OTTO")) ||
    (/\.wasm$/iu.test(path) && signature.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])));
}

/** Decode supported text before considering an explicitly recognized binary. */
export function decodeSource(bytes, path) {
  // No archive decoder is present. A ZIP magic header is not evidence that its
  // compressed contents were inspected, even if the bytes happen to be UTF-8.
  if (/\.(?:zip|docx|xlsx|pptx|jar|gz|tgz|bz2|xz|7z|rar|tar)$/iu.test(path) ||
    ["504b0304", "504b0506", "504b0708", "1f8b0800", "fd377a58"].includes(bytes.subarray(0, 4).toString("hex"))) {
    throw new Error("UNSCANNED_COMPRESSED_CONTENT");
  }
  if (knownBinary(bytes, path)) {
    // Latin-1 preserves every ASCII byte exactly; it does not decompress or
    // interpret image/font/PDF/WASM payloads, a limitation stated in the report.
    return { text: bytes.toString("latin1"), encoding: "binary-ascii-literals" };
  }
  let encoding;
  let offset = 0;
  if (bytes[0] === 255 && bytes[1] === 254) { encoding = "utf-16le"; offset = 2; }
  else if (bytes[0] === 254 && bytes[1] === 255) { encoding = "utf-16be"; offset = 2; }
  else if (bytes.includes(0) && bytes.length % 2 === 0) {
    const pairs = Math.min(bytes.length / 2, 2048);
    let even = 0, odd = 0;
    for (let i = 0; i < pairs; i++) { if (bytes[2 * i] === 0) even++; if (bytes[2 * i + 1] === 0) odd++; }
    if (odd >= pairs * 0.5 && even <= pairs * 0.05) encoding = "utf-16le";
    else if (even >= pairs * 0.5 && odd <= pairs * 0.05) encoding = "utf-16be";
  }
  if (encoding) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset));
      if (text.includes("\0")) throw new Error();
      if (offset === 0 && /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new Error();
      return { text, encoding };
    } catch { throw new Error("UNSUPPORTED_SOURCE_ENCODING"); }
  }
  if (!bytes.includes(0)) {
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" }; }
    catch { /* Legacy text is accepted only under the constraints below. */ }
  }
  if (/\.(?:[cm]?[jt]sx?|ps1|json|ya?ml|md|txt|css|html?|sql|sh|toml|csv)$/iu.test(path) &&
    bytes.length > 0 && bytes.every(byte => ![0, 129, 141, 143, 144, 157].includes(byte) && (byte >= 32 || [9, 10, 13].includes(byte)))) {
    const ascii = bytes.reduce((count, byte) => count + Number(byte < 127), 0);
    if (ascii >= bytes.length * 0.7) return { text: new TextDecoder("windows-1252", { fatal: true }).decode(bytes), encoding: "legacy-ascii-compatible-text" };
  }
  throw new Error("UNSUPPORTED_SOURCE_ENCODING");
}

function batchObjects(objects, runGit, callback) {
  for (let start = 0; start < objects.length;) {
    const batch = [];
    let batchBytes = 0;
    while (start < objects.length && batch.length < 128 && (batch.length === 0 || batchBytes + objects[start].size <= 64 * 1024 * 1024)) {
      batchBytes += objects[start].size;
      batch.push(objects[start++]);
    }
    const content = runGit(["cat-file", "--batch"], batch.map(b => b.oid).join("\n") + "\n");
    let offset = 0;
    for (const object of batch) {
      const end = content.indexOf(10, offset);
      if (end < 0) throw new Error("HISTORY_READ_MISMATCH");
      const [actual, type, rawSize] = content.subarray(offset, end).toString("ascii").split(" ");
      if (actual !== object.oid || type !== object.type || !/^\d+$/u.test(rawSize) || Number(rawSize) !== object.size) throw new Error("HISTORY_READ_MISMATCH");
      const size = Number(rawSize);
      if (end + size + 1 >= content.length || content[end + size + 1] !== 10) throw new Error("HISTORY_READ_MISMATCH");
      const bytes = content.subarray(end + 1, end + 1 + size);
      offset = end + size + 2;
      callback(object, bytes);
    }
    if (offset !== content.length) throw new Error("HISTORY_READ_MISMATCH");
  }
}

export function scanRepository({ history = false, exceptions = [], includeUntracked = true, repositoryRoot = ROOT } = {}) {
  validateExceptions(exceptions);
  const runGit = (args, input) => git(args, input, repositoryRoot);
  const findings = [], coverage = { workingFiles: 0, historicalBlobs: 0, historicalPaths: 0, historicalMessages: 0, binaryBlobs: 0, utf16Files: 0, legacyTextFiles: 0 };
  const inspectPath = (path, extra = {}) => {
    // A filename is itself publishable data. Its content hash cannot exempt
    // credentials in its name, even when the file body is completely harmless.
    findings.push(...inspectRaw(path, "[filename]").map(finding => ({ ...finding, path, line: 1, location: "filename", ...extra })));
  };
  const inspectBytes = (bytes, path, extra = {}, allowExceptions = true) => {
    let decoded;
    try { decoded = decodeSource(bytes, path); }
    catch (error) { findings.push({ rule: error?.message === "UNSCANNED_COMPRESSED_CONTENT" ? "unscanned-compressed-content" : "unsupported-source-encoding", path, line: 1, ...extra }); return; }
    if (decoded.encoding === "binary-ascii-literals") coverage.binaryBlobs++;
    if (decoded.encoding.startsWith("utf-16")) coverage.utf16Files++;
    if (decoded.encoding === "legacy-ascii-compatible-text") coverage.legacyTextFiles++;
    const detected = inspectRaw(decoded.text, path);
    if (decoded.encoding.startsWith("utf-16")) {
      // A valid UTF-16 prefix may be followed by an ASCII credential whose byte
      // pairs decode as unrelated Unicode characters. Inspect both surfaces.
      for (const finding of inspectRaw(bytes.toString("latin1"), path)) {
        if (!detected.some(existing => existing.rule === finding.rule && existing.line === finding.line)) detected.push(finding);
      }
    }
    const reviewed = allowExceptions ? applyExceptions(detected, bytes, path, exceptions) : detected;
    findings.push(...reviewed.filter(f => !extra.oid || f.rule !== "unapproved-public-environment").map(f => ({ ...f, ...extra })));
  };
  const paths = utf8(runGit(["ls-files", "-z", ...(includeUntracked ? ["--cached", "--others", "--exclude-standard"] : [])])).split("\0").filter(Boolean);
  for (const path of new Set(paths)) {
    inspectPath(path);
    const absolute = resolve(repositoryRoot, path);
    let stat;
    try { stat = lstatSync(absolute); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
    if (!stat.isFile() || stat.isSymbolicLink()) { findings.push({ rule: "source-not-regular-file", path, line: 1 }); continue; }
    if (forbiddenPath(path)) findings.push({ rule: "sensitive-path", path, line: 1 });
    if (stat.size > MAX_BLOB) { findings.push({ rule: "oversized-unscanned-file", path, line: 1 }); continue; }
    const bytes = readFileSync(absolute);
    coverage.workingFiles++;
    inspectBytes(bytes, path);
  }
  if (history) {
    if (runGit(["rev-parse", "--is-shallow-repository"]).toString("ascii").trim() !== "false") throw new Error("INCOMPLETE_SHALLOW_HISTORY");
    const ids = runGit(["rev-list", "--objects", "--all", "--no-object-names"]).toString("ascii").trim().split("\n");
    if (!ids.length || ids.some(oid => !/^[a-f0-9]{40,64}$/u.test(oid))) throw new Error("EMPTY_OR_INVALID_HISTORY");
    const metadata = runGit(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], ids.join("\n") + "\n").toString("ascii").trim().split("\n");
    if (metadata.length !== ids.length) throw new Error("HISTORY_READ_MISMATCH");
    const objects = metadata.map((line, index) => {
      const [oid, type, rawSize] = line.split(" ");
      if (oid !== ids[index] || !["blob", "tree", "commit", "tag"].includes(type) || !/^\d+$/u.test(rawSize)) throw new Error("HISTORY_READ_MISMATCH");
      return { oid, type, size: Number(rawSize) };
    });
    const byId = new Map(objects.map(object => [object.oid, object]));
    const roots = new Set();
    const messageObjects = objects.filter(object => ["commit", "tag"].includes(object.type));
    for (const object of messageObjects.filter(object => object.size > MAX_BLOB)) {
      findings.push({ rule: "oversized-unscanned-history", path: `[git-${object.type}:${object.oid}]`, oid: object.oid, line: 1 });
    }
    batchObjects(messageObjects.filter(object => object.size <= MAX_BLOB), runGit, (object, bytes) => {
      coverage.historicalMessages++;
      inspectBytes(bytes, `[git-${object.type}:${object.oid}]`, { oid: object.oid }, false);
      const header = bytes.subarray(0, bytes.indexOf(10) < 0 ? bytes.length : bytes.indexOf(10)).toString("ascii");
      if (object.type === "commit") {
        const tree = /^tree ([a-f0-9]{40,64})$/u.exec(header)?.[1];
        if (!tree || byId.get(tree)?.type !== "tree") throw new Error("HISTORY_READ_MISMATCH");
        roots.add(tree);
      } else {
        const target = /^object ([a-f0-9]{40,64})$/u.exec(header)?.[1];
        if (!target || !byId.has(target)) throw new Error("HISTORY_READ_MISMATCH");
        if (byId.get(target).type === "tree") roots.add(target);
      }
    });
    for (const reference of utf8(runGit(["for-each-ref", "--format=%(objectname) %(refname)"])).trim().split("\n").filter(Boolean)) {
      const space = reference.indexOf(" ");
      const oid = reference.slice(0, space), name = reference.slice(space + 1);
      if (space < 0 || !/^[a-f0-9]{40,64}$/u.test(oid)) throw new Error("HISTORY_READ_MISMATCH");
      const location = `[git-ref:${createHash("sha256").update(name).digest("hex")}]`;
      findings.push(...inspectRaw(name, location).map(finding => ({ ...finding, oid })));
      if (byId.get(oid)?.type === "tree") roots.add(oid);
    }
    // rev-list assigns one arbitrary name to a reused blob. Enumerate every
    // tree snapshot to retain all path/blob pairs, including copies and renames.
    const blobPaths = new Map();
    for (const tree of roots) {
      const entries = utf8(runGit(["ls-tree", "-rz", "--full-tree", tree])).split("\0").filter(Boolean);
      for (const entry of entries) {
        const match = /^([0-7]+) (blob|commit) ([a-f0-9]{40,64})\t([\s\S]+)$/u.exec(entry);
        if (!match) throw new Error("HISTORY_PATH_READ_MISMATCH");
        const [, , type, oid, path] = match;
        if (type === "commit") { findings.push({ rule: "unscanned-historical-submodule", path, oid, line: 1 }); continue; }
        if (byId.get(oid)?.type !== "blob") throw new Error("HISTORY_READ_MISMATCH");
        if (!blobPaths.has(oid)) blobPaths.set(oid, new Set());
        blobPaths.get(oid).add(path);
      }
    }
    // A tag/ref may point directly at a blob or tree instead of a commit.
    // Unnamed blobs are still scanned and never inherit a pathname exception.
    const blobs = objects.filter(object => object.type === "blob");
    for (const object of blobs) {
      const paths = blobPaths.get(object.oid) ?? new Set([`[blob:${object.oid}]`]);
      coverage.historicalPaths += paths.size;
      for (const path of paths) {
        inspectPath(path, { oid: object.oid });
        if (credentialPath(path)) findings.push({ rule: "historical-sensitive-path", path, oid: object.oid, line: 1 });
        if (object.size > MAX_BLOB) findings.push({ rule: "oversized-unscanned-history", path, oid: object.oid, line: 1 });
      }
    }
    batchObjects(blobs.filter(object => object.size <= MAX_BLOB), runGit, (object, bytes) => {
      coverage.historicalBlobs++;
      for (const path of blobPaths.get(object.oid) ?? [`[blob:${object.oid}]`]) inspectBytes(bytes, path, { oid: object.oid });
    });
  }
  return { schema: 2, checkedAt: new Date().toISOString(), revision: runGit(["rev-parse", "HEAD"]).toString("ascii").trim(),
    scope: history ? "working-tree-and-reachable-local-history" : "working-tree", coverage, passed: findings.length === 0,
    findings: findings.map(finding => ({ ...finding, path: reportPath(finding.path) })),
    limits: ["Pattern-based detection cannot prove the absence of every secret.", "Ignored local environment files are not publication candidates and are not read by this scanner.", "Recognized images, fonts, PDF and WASM receive ASCII-literal inspection only: their compressed or encoded payloads and steganography are not decoded. Archives including ZIP/Office and unknown binary formats fail closed.", "UTF-16 is inspected as decoded text and raw ASCII literals, including mixed-encoding tails. Legacy text is decoded only for supported source extensions with at least 70% ASCII, no NUL/control bytes other than tab/newline, and no undefined Windows-1252 bytes. This preserves ASCII credentials but does not certify the original encoding.", "History includes local reachable commit/tag messages and every path/blob pair in commit trees; it requires a non-shallow checkout."] };
}

/** Public CI artifacts retain the decision and coverage, not incident locations. */
export function redactLocations(report) {
  return {
    ...report,
    findings: report.findings.map(finding => ({
      rule: finding.rule,
      locationSha256: createHash("sha256").update([finding.path, finding.oid ?? "", String(finding.line)].join("\0")).digest("hex"),
    })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !["--history", "--tracked-only", "--redact-locations"].includes(arg) && !arg.startsWith("--report="))) throw new Error("UNSUPPORTED_ARGUMENT");
    const policyPath = new URL("../security/secret-fixtures.json", import.meta.url);
    const exceptions = JSON.parse(readFileSync(policyPath, "utf8"));
    const scanned = scanRepository({ history: args.includes("--history"), includeUntracked: !args.includes("--tracked-only"), exceptions });
    const report = args.includes("--redact-locations") ? redactLocations(scanned) : scanned;
    const destination = args.find((arg) => arg.startsWith("--report="))?.slice(9);
    if (destination) { mkdirSync(dirname(resolve(destination)), { recursive: true }); writeFileSync(destination, JSON.stringify(report, null, 2) + "\n"); }
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    // Never print child process stderr, source contents or raw exception messages.
    const code = /^[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "SECURITY_SCAN_FAILED";
    console.error(code);
    process.exitCode = 1;
  }
}
