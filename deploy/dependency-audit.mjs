import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const ADVISORY_ID = "GHSA-vfj7-8cjw-p6xm";
const REGISTRY_ID = 1240992;
const PACKAGE_KEY = "braces@3.0.3";
const PATCH_FILE = "patches/braces@3.0.3.patch";
const REGRESSION_FILE = "deploy/dependency-patches.test.mjs";
const SHA256 = /^[a-f0-9]{64}$/u;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length > 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

/** Accept only the captured, unfiltered pnpm audit JSON contract. */
export function validateAuditReport(report, auditExitCode) {
  requireCondition(auditExitCode === 0 || auditExitCode === 1, "El comando pnpm audit no terminó con un código válido (0/1)");
  requireCondition(object(report), "El informe de auditoría no es un objeto JSON válido");
  requireCondition(Object.keys(report).every((key) => ["actions", "advisories", "muted", "metadata"].includes(key)), "El informe contiene errores o un formato desconocido");
  requireCondition(Array.isArray(report.actions) && object(report.advisories) && Array.isArray(report.muted) && object(report.metadata), "Falta información obligatoria del informe de auditoría");
  requireCondition(report.muted.length === 0, "El informe contiene avisos silenciados");
  const counts = report.metadata.vulnerabilities;
  requireCondition(object(counts) && Object.keys(counts).length === SEVERITIES.length && SEVERITIES.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0), "Los contadores de vulnerabilidades son inválidos");
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "totalDependencies"]) {
    requireCondition(Number.isSafeInteger(report.metadata[field]) && report.metadata[field] >= 0, "Los contadores de dependencias son inválidos");
  }
  requireCondition(report.metadata.totalDependencies > 0, "El informe no acredita dependencias auditadas");
  const advisories = Object.entries(report.advisories).map(([key, advisory]) => {
    requireCondition(object(advisory) && Number.isSafeInteger(advisory.id) && String(advisory.id) === key, "Existe un registro de aviso desconocido o inconsistente");
    requireCondition(text(advisory.module_name) && SEVERITIES.includes(advisory.severity) && text(advisory.url), "Existe un aviso incompleto");
    requireCondition(Array.isArray(advisory.findings) && advisory.findings.length > 0 && advisory.findings.every((finding) => object(finding) && text(finding.version) && Array.isArray(finding.paths) && finding.paths.length > 0 && finding.paths.every(text)), "Un aviso no identifica todas sus versiones y rutas afectadas");
    return advisory;
  });
  for (const severity of SEVERITIES) {
    requireCondition(counts[severity] === advisories.filter((advisory) => advisory.severity === severity).length, "Los avisos y sus contadores no coinciden");
  }
  const actionIds = new Set();
  for (const action of report.actions) {
    requireCondition(object(action) && ["review", "update", "install"].includes(action.action) && text(action.module) && Array.isArray(action.resolves) && action.resolves.length > 0, "El informe contiene una acción desconocida");
    for (const finding of action.resolves) {
      requireCondition(object(finding) && Number.isSafeInteger(finding.id) && Object.hasOwn(report.advisories, finding.id) && text(finding.path), "Una acción no corresponde a un aviso válido");
      requireCondition(report.advisories[finding.id].findings.some((entry) => entry.paths.includes(finding.path)), "Una acción contiene una ruta no declarada en el aviso");
      actionIds.add(finding.id);
    }
  }
  requireCondition(advisories.every((advisory) => actionIds.has(advisory.id)), "Faltan acciones para los avisos reportados");
  requireCondition(auditExitCode === (advisories.length > 0 ? 1 : 0), "El resultado JSON no coincide con el código de salida de pnpm audit sin filtros");
  return advisories;
}

function validateMitigation(mitigation) {
  requireCondition(object(mitigation) && mitigation.advisoryId === ADVISORY_ID && mitigation.registryAdvisoryId === REGISTRY_ID && mitigation.package === "braces" && mitigation.version === "3.0.3", "La excepción de seguridad no coincide con el único aviso autorizado");
  requireCondition(mitigation.upstreamStatus === "open", "La mitigación local debe conservar visible el aviso upstream abierto");
  requireCondition(mitigation.patchFile === PATCH_FILE && SHA256.test(mitigation.patchSha256) && mitigation.regressionFile === REGRESSION_FILE && SHA256.test(mitigation.regressionSha256), "Faltan las huellas verificadas del parche o de su regresión");
  requireCondition(Array.isArray(mitigation.importerPaths) && mitigation.importerPaths.length > 0 && mitigation.importerPaths.every(text), "Faltan las rutas importadoras revisadas");
  requireCondition(object(mitigation.installedFileSha256) && Object.keys(mitigation.installedFileSha256).length > 0 && Object.entries(mitigation.installedFileSha256).every(([path, hash]) => !path.includes("\\") && !isAbsolute(path) && path.split("/").every((part) => part && part !== "." && part !== "..") && /\.(?:c|m)?js$/u.test(path) && SHA256.test(hash)), "Las huellas del módulo instalado son inválidas");
}

function within(parent, child) {
  const path = relative(parent, child);
  return path !== "" && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function packageManifest(requester, name) {
  try {
    return requester.resolve(`${name}/package.json`);
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    // Some packages export their entrypoint but deliberately hide package.json.
    let directory = dirname(requester.resolve(name));
    return (async () => {
      while (dirname(directory) !== directory) {
        const candidate = join(directory, "package.json");
        try {
          const manifest = JSON.parse(await readFile(candidate, "utf8"));
          if (manifest.name === name) return candidate;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        directory = dirname(directory);
      }
      throw new Error("No fue posible identificar el manifiesto del importador real");
    })();
  }
}

/** Resolve the package actually used by the importer, never an arbitrary store copy. */
export async function resolveInstalledBraces(root, importerPath) {
  const [workspace, ...packages] = importerPath.split(">");
  requireCondition(/^apps__[a-z0-9-]+$/u.test(workspace) && packages.length > 0 && packages.at(-1) === "braces", "Ruta importadora no admitida");
  const namePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/u;
  requireCondition(packages.every((name) => namePattern.test(name)), "La ruta importadora contiene nombres de paquete inválidos");
  let manifestPath = join(root, "apps", workspace.slice(6), "package.json");
  let requester = createRequire(manifestPath);
  for (const name of packages) {
    const importer = JSON.parse(await readFile(manifestPath, "utf8"));
    requireCondition(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some((field) => object(importer[field]) && Object.hasOwn(importer[field], name)), "La ruta auditada no corresponde a una dependencia declarada del importador");
    manifestPath = await packageManifest(requester, name);
    const imported = JSON.parse(await readFile(manifestPath, "utf8"));
    requireCondition(imported.name === name, "El paquete resuelto no coincide con la ruta importadora");
    requester = createRequire(manifestPath);
  }
  const directory = await realpath(dirname(manifestPath));
  requireCondition(within(await realpath(join(root, "node_modules")), directory), "El importador no resuelve un módulo del proyecto auditado");
  return directory;
}

async function runtimeFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    requireCondition(!entry.isSymbolicLink(), "El paquete mitigado contiene enlaces de archivos no revisados");
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && entry.name !== "node_modules") files.push(...await runtimeFiles(join(directory, entry.name), path));
    else if (entry.isFile() && /\.(?:c|m)?js$/u.test(entry.name)) files.push(path);
  }
  return files.sort();
}

export async function runInstalledRegression(root, regressionFile) {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  try {
    const { stdout } = await execFileAsync(process.execPath, ["--test", "--test-reporter=tap", join(root, regressionFile)], {
      cwd: root, env: environment, timeout: 45_000, maxBuffer: 2 * 1024 * 1024,
    });
    return { exitCode: 0, stdout };
  } catch {
    return { exitCode: 1, stdout: "" };
  }
}

function requireSuccessfulRegression(result) {
  requireCondition(object(result) && result.exitCode === 0 && typeof result.stdout === "string", "La regresión del módulo instalado falló o excedió su tiempo");
  const counts = {};
  for (const field of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...result.stdout.matchAll(new RegExp(`^# ${field} (\\d+)\\r?$`, "gm"))];
    requireCondition(matches.length === 1, "La regresión no devolvió un resumen TAP verificable");
    counts[field] = Number(matches[0][1]);
  }
  requireCondition(counts.tests > 0 && counts.tests === counts.pass && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0, "La regresión contiene pruebas fallidas, omitidas o pendientes");
  return counts.tests;
}

export async function verifyBracesMitigation({ root, mitigation, advisory, runRegression = runInstalledRegression, resolvePackage = resolveInstalledBraces }) {
  validateMitigation(mitigation);
  requireCondition(advisory.github_advisory_id === ADVISORY_ID && advisory.id === REGISTRY_ID && advisory.module_name === "braces" && advisory.url === `https://github.com/advisories/${ADVISORY_ID}` && advisory.patched_versions === "<0.0.0", "El aviso upstream cambió y exige una nueva revisión");
  requireCondition(advisory.findings.every((finding) => finding.version === "3.0.3"), "La mitigación no cubre todas las versiones afectadas");
  const paths = [...new Set(advisory.findings.flatMap((finding) => finding.paths))].sort();
  requireCondition(JSON.stringify(paths) === JSON.stringify([...new Set(mitigation.importerPaths)].sort()), "Las rutas importadoras cambiaron y requieren revisión");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const configured = manifest.pnpm?.patchedDependencies;
  requireCondition(object(configured) && Object.keys(configured).length === 1 && configured[PACKAGE_KEY] === PATCH_FILE, "pnpm.patchedDependencies no declara exactamente el parche revisado");
  requireCondition(sha256(await readFile(join(root, PATCH_FILE))) === mitigation.patchSha256, "La huella SHA256 del parche no coincide");
  requireCondition(sha256(await readFile(join(root, REGRESSION_FILE))) === mitigation.regressionSha256, "La huella SHA256 de la regresión no coincide");
  const checkedDirectories = new Set();
  for (const path of paths) {
    const directory = await resolvePackage(root, path);
    if (checkedDirectories.has(directory)) continue;
    const installed = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    requireCondition(installed.name === "braces" && installed.version === "3.0.3", "El importador utiliza una versión no cubierta por la mitigación");
    const files = await runtimeFiles(directory);
    requireCondition(JSON.stringify(files) === JSON.stringify(Object.keys(mitigation.installedFileSha256).sort()), "Los archivos JavaScript instalados difieren del módulo revisado");
    for (const file of files) {
      requireCondition(sha256(await readFile(join(directory, file))) === mitigation.installedFileSha256[file], "Los bytes del módulo instalado no corresponden al parche revisado");
    }
    checkedDirectories.add(directory);
  }
  const passedTests = requireSuccessfulRegression(await runRegression(root, REGRESSION_FILE));
  return { importerPaths: paths, verifiedInstallations: checkedDirectories.size, passedTests };
}

export async function evaluateDependencyAudit({ report, auditExitCode, root = PROJECT_ROOT, policy, runRegression, resolvePackage }) {
  const advisories = validateAuditReport(report, auditExitCode);
  const summary = { status: "pass", upstreamAdvisories: advisories.length, mitigated: [], unmitigated: [], errors: [] };
  if (advisories.length === 0) return summary;
  const advisoryRecord = (advisory) => ({ advisoryId: advisory.github_advisory_id ?? `npm:${advisory.id}`, package: advisory.module_name, severity: advisory.severity, versions: [...new Set(advisory.findings.map((finding) => finding.version))] });
  try {
    requireCondition(object(policy) && policy.schemaVersion === 1 && Array.isArray(policy.mitigations) && policy.mitigations.length === 1, "La política de mitigaciones es inválida o contiene excepciones no autorizadas");
    validateMitigation(policy.mitigations[0]);
  } catch (error) {
    summary.status = "blocked";
    summary.unmitigated = advisories.map(advisoryRecord);
    summary.errors.push(error instanceof Error ? error.message : "No fue posible validar la política");
    return summary;
  }
  for (const advisory of advisories) {
    const record = advisoryRecord(advisory);
    if (advisory.github_advisory_id !== ADVISORY_ID || advisory.id !== REGISTRY_ID || advisory.module_name !== "braces") {
      summary.unmitigated.push(record);
      continue;
    }
    try {
      const proof = await verifyBracesMitigation({ root, mitigation: policy.mitigations[0], advisory, runRegression, resolvePackage });
      summary.mitigated.push({ ...record, upstreamStatus: "open", localMitigation: "verified-pnpm-patch", ...proof });
    } catch (error) {
      summary.unmitigated.push(record);
      summary.errors.push(error instanceof Error ? error.message : "No fue posible verificar la mitigación");
    }
  }
  if (summary.unmitigated.length > 0 || summary.errors.length > 0) summary.status = "blocked";
  return summary;
}

export async function main(arguments_ = process.argv.slice(2)) {
  requireCondition(arguments_.length === 4 && arguments_[0] === "--report" && arguments_[2] === "--audit-exit-code" && /^(0|1)$/u.test(arguments_[3]), "Uso: node deploy/dependency-audit.mjs --report archivo.json --audit-exit-code 0|1");
  const report = JSON.parse(await readFile(resolve(arguments_[1]), "utf8"));
  const advisories = validateAuditReport(report, Number(arguments_[3]));
  let policy;
  if (advisories.length > 0) {
    try {
      policy = JSON.parse(await readFile(join(PROJECT_ROOT, "security/dependency-mitigations.json"), "utf8"));
    } catch {
      // Missing/invalid policy still returns every upstream advisory as unmitigated.
      policy = undefined;
    }
  }
  return evaluateDependencyAudit({ report, auditExitCode: Number(arguments_[3]), policy });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await main();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ status: "blocked", errors: [error instanceof SyntaxError ? "El archivo de auditoría no contiene JSON válido" : error instanceof Error ? error.message : "No fue posible validar la auditoría"] }, null, 2));
    process.exitCode = 1;
  }
}
