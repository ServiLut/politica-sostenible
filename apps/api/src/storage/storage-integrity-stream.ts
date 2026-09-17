import { createHash } from 'node:crypto';

export const STORAGE_INTEGRITY_FAILURE_CODES = [
  'SHA256_MISMATCH',
  'SIZE_MISMATCH',
  'TRUNCATED_DOWNLOAD',
  'CONTENT_TYPE_MISMATCH',
  'CONTENT_SIGNATURE_MISMATCH',
  'CONTENT_ENCODING_UNSUPPORTED',
  'OBJECT_NOT_FOUND',
  'STORAGE_UNAVAILABLE',
  'DOWNLOAD_TIMEOUT',
  'DOWNLOAD_HTTP_ERROR',
  'INVALID_RECORD',
  'INTERNAL_ERROR',
] as const;

export type StorageIntegrityFailureCode =
  (typeof STORAGE_INTEGRITY_FAILURE_CODES)[number];

export interface StorageIntegrityObservation {
  readonly calculatedSha256?: string;
  readonly observedSize?: number;
  readonly observedContentType?: string;
}

export class StorageIntegrityReadError extends Error {
  constructor(
    readonly code: StorageIntegrityFailureCode,
    readonly retryable: boolean,
    readonly observation: StorageIntegrityObservation = {},
  ) {
    super(`Storage integrity verification failed: ${code}`);
    this.name = 'StorageIntegrityReadError';
  }
}

export interface ReadAndHashStorageObjectInput {
  readonly url: string;
  readonly expectedSha256: string;
  readonly expectedSize: number;
  readonly expectedContentType: string;
  readonly maximumBytes: number;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

const SIGNATURE_PREFIX_BYTES = 16;
const DEFAULT_TIMEOUT_MS = 60_000;

function normalizedContentType(value: string | null): string | null {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function hasPrefix(bytes: Uint8Array, expected: readonly number[]): boolean {
  return (
    bytes.length >= expected.length &&
    expected.every((value, index) => bytes[index] === value)
  );
}

function contentSignatureMatches(
  contentType: string,
  prefix: Uint8Array,
): boolean {
  switch (contentType) {
    case 'application/pdf':
      return hasPrefix(prefix, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'image/jpeg':
      return hasPrefix(prefix, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return hasPrefix(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return (
        hasPrefix(prefix, [0x52, 0x49, 0x46, 0x46]) &&
        prefix.length >= 12 &&
        hasPrefix(prefix.subarray(8), [0x57, 0x45, 0x42, 0x50])
      );
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return hasPrefix(prefix, [0x50, 0x4b, 0x03, 0x04]);
    default:
      // CSV has no reliable magic bytes. JSON catalog packages keep their own
      // canonical parser/hash defense and do not use this generic SHA flow.
      return true;
  }
}

function httpFailure(response: Response): StorageIntegrityReadError {
  return new StorageIntegrityReadError(
    response.status === 404 ? 'OBJECT_NOT_FOUND' : 'DOWNLOAD_HTTP_ERROR',
    true,
  );
}

/**
 * Hashes the response incrementally. At most one transport chunk plus the
 * fixed 16-byte signature prefix is retained; arrayBuffer/blob/text are never
 * called and bytes are rejected as soon as the authorized bound is exceeded.
 */
export async function readAndHashStorageObject({
  url,
  expectedSha256,
  expectedSize,
  expectedContentType,
  maximumBytes,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetcher = globalThis.fetch,
}: ReadAndHashStorageObjectInput): Promise<Required<StorageIntegrityObservation>> {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > maximumBytes ||
    !/^[0-9a-f]{64}$/u.test(expectedSha256)
  ) {
    throw new StorageIntegrityReadError('INVALID_RECORD', false);
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: { 'Accept-Encoding': 'identity' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new StorageIntegrityReadError(
      timedOut ? 'DOWNLOAD_TIMEOUT' : 'STORAGE_UNAVAILABLE',
      true,
    );
  }

  if (!response.ok) throw httpFailure(response);
  if (!response.body) {
    throw new StorageIntegrityReadError('DOWNLOAD_HTTP_ERROR', true);
  }

  const contentEncoding = response.headers.get('content-encoding');
  if (contentEncoding && contentEncoding.trim().toLowerCase() !== 'identity') {
    await response.body.cancel().catch(() => undefined);
    throw new StorageIntegrityReadError(
      'CONTENT_ENCODING_UNSUPPORTED',
      false,
    );
  }

  const observedContentType = normalizedContentType(
    response.headers.get('content-type'),
  );
  if (observedContentType !== expectedContentType.toLowerCase()) {
    await response.body.cancel().catch(() => undefined);
    throw new StorageIntegrityReadError('CONTENT_TYPE_MISMATCH', false, {
      ...(observedContentType ? { observedContentType } : {}),
    });
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length !== expectedSize ||
      length > maximumBytes
    ) {
      await response.body.cancel().catch(() => undefined);
      throw new StorageIntegrityReadError('SIZE_MISMATCH', false, {
        ...(Number.isSafeInteger(length) && length > 0
          ? { observedSize: length }
          : {}),
        observedContentType,
      });
    }
  }

  const digest = createHash('sha256');
  const prefix = new Uint8Array(SIGNATURE_PREFIX_BYTES);
  let prefixLength = 0;
  let observedSize = 0;
  const reader = response.body.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) continue;

      observedSize += value.byteLength;
      if (observedSize > expectedSize || observedSize > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new StorageIntegrityReadError('SIZE_MISMATCH', false, {
          observedSize,
          observedContentType,
        });
      }

      digest.update(value);
      if (prefixLength < SIGNATURE_PREFIX_BYTES) {
        const count = Math.min(
          SIGNATURE_PREFIX_BYTES - prefixLength,
          value.byteLength,
        );
        prefix.set(value.subarray(0, count), prefixLength);
        prefixLength += count;
      }
    }
  } catch (error) {
    if (error instanceof StorageIntegrityReadError) throw error;
    const timedOut =
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new StorageIntegrityReadError(
      timedOut ? 'DOWNLOAD_TIMEOUT' : 'STORAGE_UNAVAILABLE',
      true,
      { observedSize, observedContentType },
    );
  } finally {
    reader.releaseLock();
  }

  const calculatedSha256 = digest.digest('hex');
  const observation = {
    calculatedSha256,
    observedSize,
    observedContentType,
  };
  if (observedSize !== expectedSize) {
    throw new StorageIntegrityReadError(
      'TRUNCATED_DOWNLOAD',
      false,
      observation,
    );
  }
  if (
    !contentSignatureMatches(
      observedContentType,
      prefix.subarray(0, prefixLength),
    )
  ) {
    throw new StorageIntegrityReadError(
      'CONTENT_SIGNATURE_MISMATCH',
      false,
      observation,
    );
  }
  if (calculatedSha256 !== expectedSha256) {
    throw new StorageIntegrityReadError(
      'SHA256_MISMATCH',
      false,
      observation,
    );
  }

  return observation;
}
