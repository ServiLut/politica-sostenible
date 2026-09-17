import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./api-client";
import type { ApiRequestOptions } from "./api-client";
import {
  createDirectStorageUploader,
  uploadAuthorizedFile,
  type DirectStorageUploadDependencies,
  type UploadAuthorization,
  type UploadConfirmation,
} from "./direct-storage-upload";

const PATH =
  "tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74-factura.pdf";

function authorizationFor(file: File): UploadAuthorization {
  return {
    bucket: "private-campaign-files",
    path: PATH,
    uploadUrl: "https://storage.invalid/signed-upload?token=test-only",
    uploadToken: "test-only-signed-token",
    method: "PUT",
    headers: { "Content-Type": file.type },
    metadata: { fileName: file.name, contentType: file.type, size: file.size },
  };
}

test("autoriza con JSON, sube el binario sólo a Storage y confirma con JSON", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "factura.pdf", {
    type: "application/pdf",
  });
  const authorization = authorizationFor(file);
  const confirmation: UploadConfirmation = { confirmed: true, path: PATH };
  const requests: Array<{ path: string; body: unknown }> = [];
  const uploadedFiles: File[] = [];
  const request: DirectStorageUploadDependencies["request"] = async <T>(
    path: string,
    options: ApiRequestOptions = {},
  ) => {
    requests.push({ path, body: options.body });
    return (path === "storage/upload-url" ? authorization : confirmation) as T;
  };
  const uploader = createDirectStorageUploader({
    request,
    upload: async (uploadedFile) => {
      uploadedFiles.push(uploadedFile);
    },
  });

  const result = await uploader(file, "finance");

  expect(result).toEqual(confirmation);
  expect(uploadedFiles).toEqual([file]);
  expect(requests.map(({ path }) => path)).toEqual([
    "storage/upload-url",
    "storage/complete",
  ]);
  expect(JSON.parse(requests[0].body as string)).toEqual({
    module: "finance",
    fileName: "factura.pdf",
    contentType: "application/pdf",
    size: 4,
  });
  expect(JSON.parse(requests[1].body as string)).toEqual({
    module: "finance",
    path: PATH,
    metadata: authorization.metadata,
  });
  expect(requests.every(({ body }) => typeof body === "string")).toBe(true);
  expect(requests.some(({ body }) => body === file)).toBe(false);
});

test("usa bucket, path y token firmados mediante uploadToSignedUrl", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "factura.pdf", {
    type: "application/pdf",
  });
  const authorization = authorizationFor(file);
  const calls: unknown[][] = [];
  const buckets: string[] = [];
  const storageClient = {
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          async uploadToSignedUrl(...args: unknown[]) {
            calls.push(args);
            return { data: { path: PATH, fullPath: PATH }, error: null };
          },
        };
      },
    },
  } as unknown as Pick<SupabaseClient, "storage">;

  await uploadAuthorizedFile(file, authorization, storageClient);

  expect(buckets).toEqual(["private-campaign-files"]);
  expect(calls).toEqual([
    [PATH, "test-only-signed-token", file, { contentType: "application/pdf" }],
  ]);
});

test("adjunta la huella E-14 como metadata de Storage sin alterar el flujo directo", async () => {
  const file = new File(["%PDF-1.7\nprivate"], "e14.pdf", {
    type: "application/pdf",
  });
  const sha256 = "a".repeat(64);
  const authorization: UploadAuthorization = {
    ...authorizationFor(file),
    path: "tenant-a/e14/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf",
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      contentSha256: sha256,
    },
  };
  const calls: unknown[][] = [];
  const storageClient = {
    storage: {
      from() {
        return {
          async uploadToSignedUrl(...args: unknown[]) {
            calls.push(args);
            return { data: { path: authorization.path }, error: null };
          },
        };
      },
    },
  } as unknown as Pick<SupabaseClient, "storage">;

  await uploadAuthorizedFile(file, authorization, storageClient);

  expect(calls).toEqual([
    [
      authorization.path,
      authorization.uploadToken,
      file,
      {
        contentType: "application/pdf",
        metadata: { contentSha256: sha256 },
      },
    ],
  ]);
});

test("extiende la subida directa a CONSENT sin enviar tenant ni binarios a NestJS", async () => {
  const file = new File([new Uint8Array([5, 6, 7])], "consentimiento.pdf", {
    type: "application/pdf",
  });
  const consentPath =
    "tenant-server/consent/123e4567-e89b-42d3-a456-426614174000.pdf";
  const authorization = { ...authorizationFor(file), path: consentPath };
  const bodies: Record<string, unknown>[] = [];
  const uploader = createDirectStorageUploader({
    request: async <T>(_path: string, options: ApiRequestOptions = {}) => {
      bodies.push(JSON.parse(String(options.body)) as Record<string, unknown>);
      return (
        bodies.length === 1
          ? authorization
          : { confirmed: true, path: consentPath, module: "consent" }
      ) as T;
    },
    upload: async () => undefined,
  });

  await expect(uploader(file, "consent")).resolves.toEqual({
    confirmed: true,
    path: consentPath,
    module: "consent",
  });
  expect(bodies).toEqual([
    {
      module: "consent",
      fileName: "consentimiento.pdf",
      contentType: "application/pdf",
      size: 3,
    },
    {
      module: "consent",
      path: consentPath,
      metadata: authorization.metadata,
    },
  ]);
  expect(JSON.stringify(bodies)).not.toContain("tenantId");
  expect(JSON.stringify(bodies)).not.toContain("5,6,7");
});

test("envía la huella de escrutinio a Storage sin pasar el binario por NestJS", async () => {
  const file = new File([new Uint8Array([9, 8, 7])], "e26.pdf", {
    type: "application/pdf",
  });
  const sha256 = "e".repeat(64);
  const scrutinyPath =
    "tenant-server/scrutiny/123e4567-e89b-42d3-a456-426614174000.pdf";
  const authorization: UploadAuthorization = {
    ...authorizationFor(file),
    path: scrutinyPath,
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      contentSha256: sha256,
    },
  };
  const bodies: Record<string, unknown>[] = [];
  const uploader = createDirectStorageUploader({
    request: async <T>(_path: string, options: ApiRequestOptions = {}) => {
      bodies.push(JSON.parse(String(options.body)) as Record<string, unknown>);
      return (
        bodies.length === 1
          ? authorization
          : { confirmed: true, path: scrutinyPath, module: "scrutiny" }
      ) as T;
    },
    upload: async () => undefined,
  });

  await uploader(file, "scrutiny", sha256);

  expect(bodies).toEqual([
    {
      module: "scrutiny",
      fileName: "e26.pdf",
      contentType: "application/pdf",
      size: 3,
      contentSha256: sha256,
    },
    {
      module: "scrutiny",
      path: scrutinyPath,
      metadata: authorization.metadata,
    },
  ]);
  expect(JSON.stringify(bodies)).not.toContain("tenantId");
  expect(JSON.stringify(bodies)).not.toContain("9,8,7");
});

test("falla cerrado si la confirmación no corresponde a la ruta autorizada", async () => {
  const file = new File([new Uint8Array([1])], "factura.pdf", {
    type: "application/pdf",
  });
  const authorization = authorizationFor(file);
  const uploader = createDirectStorageUploader({
    request: async <T>(path: string) =>
      (path === "storage/upload-url"
        ? authorization
        : { confirmed: true, path: "tenant-ajeno/finance/otro.pdf" }) as T,
    upload: async () => undefined,
  });

  await expect(uploader(file, "finance")).rejects.toBeInstanceOf(ApiError);
});
