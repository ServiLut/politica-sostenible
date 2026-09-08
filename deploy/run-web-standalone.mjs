import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assertPathExists(path, description) {
  if (!existsSync(path)) {
    throw new Error(`${description} no existe: ${path}`);
  }
}

function assertContainedPath(parent, child) {
  const pathFromParent = relative(parent, child);
  if (
    pathFromParent === "" ||
    pathFromParent === ".." ||
    pathFromParent.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) ||
    isAbsolute(pathFromParent)
  ) {
    throw new Error(`Destino standalone fuera del limite permitido: ${child}`);
  }
}

function replaceDirectory(source, destination, standaloneRoot) {
  assertContainedPath(standaloneRoot, destination);
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

export function prepareStandaloneAssets({
  webRoot = resolve(repositoryRoot, "apps", "web"),
  standaloneAppRoot = resolve(
    repositoryRoot,
    "apps",
    "web",
    ".next",
    "standalone",
    "apps",
    "web",
  ),
} = {}) {
  const publicSource = resolve(webRoot, "public");
  const staticSource = resolve(webRoot, ".next", "static");
  const serverPath = resolve(standaloneAppRoot, "server.js");

  assertPathExists(publicSource, "El directorio publico de Next.js");
  assertPathExists(staticSource, "Los activos estaticos del build de Next.js");
  assertPathExists(serverPath, "El servidor standalone de Next.js");

  replaceDirectory(
    publicSource,
    resolve(standaloneAppRoot, "public"),
    standaloneAppRoot,
  );
  replaceDirectory(
    staticSource,
    resolve(standaloneAppRoot, ".next", "static"),
    standaloneAppRoot,
  );

  return serverPath;
}

export function runStandaloneServer(serverPath, environment = process.env) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: dirname(serverPath),
    env: {
      ...environment,
      HOSTNAME: environment.HOSTNAME?.trim() || "127.0.0.1",
      PORT: environment.PORT?.trim() || "3000",
    },
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  child.once("error", (error) => {
    console.error(
      `No se pudo iniciar el servidor standalone: ${error.message}`,
    );
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    process.exitCode = code ?? (signal === "SIGTERM" ? 143 : 130);
  });

  return child;
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  try {
    runStandaloneServer(prepareStandaloneAssets());
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "No se pudo preparar el servidor standalone",
    );
    process.exitCode = 1;
  }
}
