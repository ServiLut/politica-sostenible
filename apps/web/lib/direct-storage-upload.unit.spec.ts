import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
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
