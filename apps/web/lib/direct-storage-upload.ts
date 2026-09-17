import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, apiRequest, type ApiRequestOptions } from "./api-client";

export type StorageModule =
  | "finance"
  | "e14"
  | "consent"
  | "scrutiny"
  | "electoral-calendar"
  | "signature-collection"
  | "pqrsd";

export interface UploadAuthorization {
  bucket: string;
  path: string;
  uploadUrl: string;
  uploadToken: string;
  method: "PUT";
  headers: Record<string, string>;
  metadata: {
    fileName: string;
    contentType: string;
    size: number;
    contentSha256?: string;
  };
}

export interface UploadConfirmation {
  confirmed: true;
  objectId: string;
  path: string;
  module?: StorageModule;
  contentIntegrity:
    | "NOT_PROVIDED"
    | "PENDING"
    | "VERIFIED"
    | "FAILED";
}

export interface ClientDeclaredHashUploadConfirmation
  extends UploadConfirmation {
  sha256: string;
}

type StorageClient = Pick<SupabaseClient, "storage">;

export interface DirectStorageUploadDependencies {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  upload(file: File, authorization: UploadAuthorization): Promise<void>;
  waitForIntegrity?: (
    objectId: string,
    options?: StorageIntegrityPollingOptions,
  ) => Promise<StorageIntegrityStatusResponse>;
}

export interface StorageIntegrityStatusResponse {
  objectId: string;
  status: "NOT_PROVIDED" | "PENDING" | "VERIFIED" | "FAILED";
  verifiedAt: string | null;
  failureCode: string | null;
}

export interface StorageIntegrityPollingOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maximumRequests?: number;
  initialDelayMs?: number;
  maximumDelayMs?: number;
}

interface StorageIntegrityPollingDependencies {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  now(): number;
  wait(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

const DEFAULT_INTEGRITY_TIMEOUT_MS = 180_000;
const DEFAULT_INTEGRITY_MAXIMUM_REQUESTS = 40;
const DEFAULT_INTEGRITY_INITIAL_DELAY_MS = 750;
const DEFAULT_INTEGRITY_MAXIMUM_DELAY_MS = 8_000;
const STORAGE_OBJECT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

let browserStorageClient: StorageClient | null = null;

function getBrowserStorageClient(): StorageClient {
  if (browserStorageClient) return browserStorageClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    throw new ApiError(
      "El almacenamiento privado no está configurado en esta aplicación.",
      0,
    );
  }

  browserStorageClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return browserStorageClient;
}

function headerValue(headers: Record<string, string>, name: string) {
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

export function validateUploadAuthorization(
  authorization: UploadAuthorization,
  expectedMetadata: UploadAuthorization["metadata"],
) {
  const authorizedContentType = headerValue(
    authorization.headers,
    "Content-Type",
  );

  if (
    !authorization.bucket?.trim() ||
    !authorization.path?.trim() ||
    !authorization.uploadUrl?.trim() ||
    !authorization.uploadToken?.trim() ||
    authorization.method !== "PUT" ||
    authorizedContentType !== authorization.metadata.contentType ||
    authorization.metadata.fileName !== expectedMetadata.fileName ||
    authorization.metadata.contentType !== expectedMetadata.contentType ||
    authorization.metadata.size !== expectedMetadata.size ||
    (authorization.metadata.contentSha256 ?? null) !==
      (expectedMetadata.contentSha256 ?? null)
  ) {
    throw new ApiError(
      "La API devolvió una autorización de almacenamiento inválida.",
      502,
    );
  }
}

function storageErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;

  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = Number(candidate.status ?? candidate.statusCode);
  return Number.isInteger(status) ? status : 0;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ApiError("La política de verificación no es válida.", 500);
  }
  return value;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

async function waitWithAbort(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortReason(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const defaultIntegrityPollingDependencies: StorageIntegrityPollingDependencies = {
  request: apiRequest,
  now: Date.now,
  wait: waitWithAbort,
};

export async function waitForStorageIntegrityVerification(
  objectId: string,
  options: StorageIntegrityPollingOptions = {},
  dependencies: StorageIntegrityPollingDependencies =
    defaultIntegrityPollingDependencies,
): Promise<StorageIntegrityStatusResponse> {
  if (!STORAGE_OBJECT_ID.test(objectId)) {
    throw new ApiError(
      "La API devolvió un identificador de almacenamiento inválido.",
      502,
    );
  }

  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_INTEGRITY_TIMEOUT_MS,
    1,
    10 * 60_000,
  );
  const maximumRequests = boundedInteger(
    options.maximumRequests,
    DEFAULT_INTEGRITY_MAXIMUM_REQUESTS,
    1,
    100,
  );
  let delayMs = boundedInteger(
    options.initialDelayMs,
    DEFAULT_INTEGRITY_INITIAL_DELAY_MS,
    1,
    30_000,
  );
  const maximumDelayMs = boundedInteger(
    options.maximumDelayMs,
    DEFAULT_INTEGRITY_MAXIMUM_DELAY_MS,
    delayMs,
    30_000,
  );
  const deadline = dependencies.now() + timeoutMs;

  for (
    let requestNumber = 1;
    requestNumber <= maximumRequests;
    requestNumber += 1
  ) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    const status = await dependencies.request<StorageIntegrityStatusResponse>(
      `storage/${encodeURIComponent(objectId)}/integrity`,
      { signal: options.signal },
    );
    if (status.objectId !== objectId) {
      throw new ApiError(
        "La API devolvió un estado de integridad inconsistente.",
        502,
      );
    }
    if (status.status === "VERIFIED") {
      if (!status.verifiedAt || status.failureCode !== null) {
        throw new ApiError(
          "La API devolvió un estado de integridad inconsistente.",
          502,
        );
      }
      return status;
    }
    if (status.status === "FAILED") {
      throw new ApiError(
        `La verificación independiente rechazó el archivo${status.failureCode ? ` (${status.failureCode})` : ""}.`,
        422,
        status,
      );
    }
    if (
      status.status !== "PENDING" ||
      status.verifiedAt !== null
    ) {
      throw new ApiError(
        "La API devolvió un estado de integridad inconsistente.",
        502,
      );
    }

    const remainingMs = deadline - dependencies.now();
    if (requestNumber === maximumRequests || remainingMs <= 0) break;
    await dependencies.wait(Math.min(delayMs, remainingMs), options.signal);
    delayMs = Math.min(maximumDelayMs, Math.ceil(delayMs * 1.6));
  }

  throw new ApiError(
    "La verificación independiente sigue pendiente. El archivo quedó guardado y puede verificarse nuevamente sin volver a enviarlo.",
    504,
    { objectId },
  );
}

export async function uploadAuthorizedFile(
  file: File,
  authorization: UploadAuthorization,
  storageClient: StorageClient = getBrowserStorageClient(),
): Promise<void> {
  let result: Awaited<
    ReturnType<
      ReturnType<StorageClient["storage"]["from"]>["uploadToSignedUrl"]
    >
  >;

  try {
    result = await storageClient.storage
      .from(authorization.bucket)
      .uploadToSignedUrl(authorization.path, authorization.uploadToken, file, {
        contentType: authorization.metadata.contentType,
        ...(authorization.metadata.contentSha256
          ? {
              metadata: {
                contentSha256: authorization.metadata.contentSha256,
              },
            }
          : {}),
      });
  } catch (cause) {
    throw new ApiError(
      "No fue posible enviar el archivo al almacenamiento privado.",
      0,
      cause,
    );
  }

  if (result.error) {
    throw new ApiError(
      "El almacenamiento privado rechazó el archivo. Intenta nuevamente.",
      storageErrorStatus(result.error),
      result.error,
    );
  }
}

export function createDirectStorageUploader({
  request,
  upload,
  waitForIntegrity = (objectId, options) =>
    waitForStorageIntegrityVerification(objectId, options, {
      ...defaultIntegrityPollingDependencies,
      request,
    }),
}: DirectStorageUploadDependencies) {
  return async function uploadFileDirectly(
    file: File,
    module: StorageModule,
    contentSha256?: string,
    pollingOptions?: StorageIntegrityPollingOptions,
  ): Promise<UploadConfirmation> {
    const metadata = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      ...(contentSha256 ? { contentSha256 } : {}),
    };
    const authorization = await request<UploadAuthorization>(
      "storage/upload-url",
      {
        method: "POST",
        body: JSON.stringify({ module, ...metadata }),
      },
    );

    validateUploadAuthorization(authorization, metadata);
    await upload(file, authorization);

    const confirmation = await request<UploadConfirmation>("storage/complete", {
      method: "POST",
      body: JSON.stringify({
        module,
        path: authorization.path,
        metadata: authorization.metadata,
      }),
    });
    if (
      confirmation.confirmed !== true ||
      !STORAGE_OBJECT_ID.test(confirmation.objectId) ||
      confirmation.path !== authorization.path ||
      (confirmation.module !== undefined && confirmation.module !== module)
    ) {
      throw new ApiError(
        "La API devolvió una confirmación de almacenamiento inválida.",
        502,
        confirmation,
      );
    }
    if (!contentSha256) {
      if (confirmation.contentIntegrity !== "NOT_PROVIDED") {
        throw new ApiError(
          "La API devolvió una confirmación de almacenamiento inválida.",
          502,
          confirmation,
        );
      }
      return confirmation;
    }
    if (confirmation.contentIntegrity === "FAILED") {
      throw new ApiError(
        "La verificación independiente rechazó el archivo.",
        422,
        confirmation,
      );
    }
    if (
      confirmation.contentIntegrity !== "PENDING" &&
      confirmation.contentIntegrity !== "VERIFIED"
    ) {
      throw new ApiError(
        "La API devolvió una confirmación de almacenamiento inválida.",
        502,
        confirmation,
      );
    }
    if (confirmation.contentIntegrity === "PENDING") {
      await waitForIntegrity(confirmation.objectId, pollingOptions);
    }
    return { ...confirmation, contentIntegrity: "VERIFIED" };
  };
}

export const uploadFileDirectly = createDirectStorageUploader({
  request: apiRequest,
  upload: uploadAuthorizedFile,
});

export async function sha256File(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The browser declares SHA-256 before direct upload. A separate NestJS worker
 * then downloads the private object through a short-lived URL, hashes its byte
 * stream and this function waits for that independent result. The upload bytes
 * still travel browser -> Storage and never through the API request body. */
export async function uploadFileDirectlyWithClientDeclaredHash(
  file: File,
  module: StorageModule,
  pollingOptions?: StorageIntegrityPollingOptions,
): Promise<ClientDeclaredHashUploadConfirmation> {
  const contentSha256 = await sha256File(file);
  const confirmation = await uploadFileDirectly(
    file,
    module,
    contentSha256,
    pollingOptions,
  );
  return { ...confirmation, sha256: contentSha256 };
}
