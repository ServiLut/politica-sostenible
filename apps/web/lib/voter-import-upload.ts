import type { CreateVoterImportJobInput } from "./import-api";
import {
  applyBulkVoterImportEvidencePaths,
  formatVoterImportSize,
  MAX_CONSENT_EVIDENCE_BYTES,
  planBulkVoterImportEvidence,
  type BulkVoterImportLimits,
} from "./voter-import";

interface PreparedArtifact {
  path: string;
  sha256: string;
}
export interface VoterImportUploadDependencies {
  upload(
    file: File,
    module: "consent" | "person-import",
    signal: AbortSignal,
  ): Promise<PreparedArtifact>;
  requestId(): string;
}

/** This session contains only in-memory references; server jobs remain resumable
 * through their authorized history after a page reload. */
export function createVoterImportUploadSession(
  dependencies: VoterImportUploadDependencies,
) {
  const evidencePaths = new WeakMap<File, string>();
  let lastSource: {
    contents: string;
    fileName: string;
    input: CreateVoterImportJobInput;
  } | null = null;
  return {
    async prepare({
      file,
      evidenceFiles,
      limits,
      signal,
      onProgress,
      onUnused,
    }: {
      file: File;
      evidenceFiles: readonly File[];
      limits: BulkVoterImportLimits;
      signal: AbortSignal;
      onProgress(message: string): void;
      onUnused(count: number): void;
    }): Promise<CreateVoterImportJobInput> {
      if (
        !/^[^\x00-\x1f\x7f/\\]+\.csv$/iu.test(file.name) ||
        file.name.length > 180
      ) {
        throw new Error(
          "Elige un archivo .csv con un nombre de hasta 180 caracteres. En Excel, usa Guardar como → CSV UTF-8.",
        );
      }
      if (file.size > limits.maxBytes)
        throw new Error(
          `El archivo supera el máximo de ${formatVoterImportSize(limits.maxBytes)}.`,
        );
      signal.throwIfAborted();
      onProgress("Leyendo el archivo…");
      const csv = await file.text();
      signal.throwIfAborted();
      const plan = planBulkVoterImportEvidence(csv, evidenceFiles, limits);
      const maximumEvidenceBytes = Math.min(
        MAX_CONSENT_EVIDENCE_BYTES,
        limits.maxEvidenceBytes ?? limits.maxBytes,
      );
      const oversized = plan.matches.find(
        (match) => match.file.size > maximumEvidenceBytes,
      );
      if (oversized) {
        throw new Error(
          `La autorización ${oversized.file.name} supera el máximo de ${formatVoterImportSize(maximumEvidenceBytes)} permitido por el almacenamiento.`,
        );
      }
      onUnused(plan.unusedFileNames.length);
      const paths = new Map<string, string>();
      for (const [index, match] of plan.matches.entries()) {
        signal.throwIfAborted();
        onProgress(
          `Comprobando evidencia ${index + 1} de ${plan.matches.length}: ${match.file.name}`,
        );
        let path = evidencePaths.get(match.file);
        if (!path) {
          const uploaded = await dependencies.upload(
            match.file,
            "consent",
            signal,
          );
          signal.throwIfAborted();
          path = uploaded.path;
          evidencePaths.set(match.file, path);
        }
        paths.set(match.reference, path);
      }
      const prepared = applyBulkVoterImportEvidencePaths(csv, paths, limits);
      signal.throwIfAborted();
      if (
        lastSource?.contents === prepared &&
        lastSource.fileName === file.name
      )
        return lastSource.input;
      onProgress(
        "Cargando y comprobando el CSV. Mantén esta ventana abierta hasta que comience la revisión.",
      );
      const source = await dependencies.upload(
        new File([prepared], file.name, { type: "text/csv" }),
        "person-import",
        signal,
      );
      signal.throwIfAborted();
      const input = {
        clientRequestId: dependencies.requestId(),
        sourceArtifactPath: source.path,
        expectedContentSha256: source.sha256,
        fileName: file.name,
      };
      lastSource = { contents: prepared, fileName: file.name, input };
      return input;
    },
  };
}
