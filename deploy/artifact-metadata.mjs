import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const APPLICATION_SOURCE =
  "https://github.com/ServiLut/politica-sostenible";

const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;
const ALLOWED_PROFILES = new Set(["production", "evaluation"]);

export function artifactMetadataIssues(environment = process.env) {
  const profile =
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() || "production";
  const revision = environment.APP_REVISION?.trim() ?? "";
  const source = environment.APP_SOURCE?.trim() ?? "";
  const issues = [];

  if (!ALLOWED_PROFILES.has(profile)) {
    issues.push("DEPLOYMENT_PROFILE debe ser production o evaluation");
  }

  if (source !== APPLICATION_SOURCE) {
    issues.push("APP_SOURCE no identifica el repositorio canonico");
  }

  if (profile === "evaluation") {
    if (revision !== "unknown" && !FULL_GIT_SHA.test(revision)) {
      issues.push(
        "APP_REVISION debe ser unknown o un SHA Git completo en evaluation",
      );
    }
  } else if (revision !== "unknown" && !FULL_GIT_SHA.test(revision)) {
    issues.push(
      "APP_REVISION debe ser un SHA Git completo de 40 caracteres en production",
    );
  }

  return issues;
}

export function requireArtifactMetadata(environment = process.env) {
  const issues = artifactMetadataIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Metadatos de artefacto invalidos:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  try {
    requireArtifactMetadata();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Build invalido");
    process.exitCode = 1;
  }
}

