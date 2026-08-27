import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, apiRequest, type ApiRequestOptions } from "./api-client";

export type StorageModule = "finance" | "e14" | "evidence" | "avatars";

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
  };
}

export interface UploadConfirmation {
  confirmed: true;
  path: string;
}

type StorageClient = Pick<SupabaseClient, "storage">;

export interface DirectStorageUploadDependencies {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  upload(file: File, authorization: UploadAuthorization): Promise<void>;
}

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

function validateAuthorization(
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
    authorization.metadata.size !== expectedMetadata.size
  ) {
    throw new ApiError(
      "La API devolvió una autorización de almacenamiento inválida.",
      502,
      authorization,
    );
  }
}

function storageErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;

  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = Number(candidate.status ?? candidate.statusCode);
  return Number.isInteger(status) ? status : 0;
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
}: DirectStorageUploadDependencies) {
  return async function uploadFileDirectly(
    file: File,
    module: StorageModule,
  ): Promise<UploadConfirmation> {
    const metadata = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    };
    const authorization = await request<UploadAuthorization>(
      "storage/upload-url",
      {
        method: "POST",
        body: JSON.stringify({ module, ...metadata }),
      },
    );

    validateAuthorization(authorization, metadata);
    await upload(file, authorization);

    return request<UploadConfirmation>("storage/complete", {
      method: "POST",
      body: JSON.stringify({
        module,
        path: authorization.path,
        metadata: authorization.metadata,
      }),
    });
  };
}

export const uploadFileDirectly = createDirectStorageUploader({
  request: apiRequest,
  upload: uploadAuthorizedFile,
});
