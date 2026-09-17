import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';
import { ElectoralCatalogArtifactService } from './electoral-catalog-artifact.service';
import { RNEC_CATALOG_MAX_CONTENT_BYTES } from './rnec-divipole-tree.parser';

describe('ElectoralCatalogArtifactService', () => {
  const path = 'tenant-a/electoral-catalog/source.json';
  const content = '{"departments":[]}';
  const bytes = new TextEncoder().encode(content);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let gateway: { createSignedDownloadUrl: jest.Mock };
  let service: ElectoralCatalogArtifactService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    gateway = {
      createSignedDownloadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://private-storage.example/object?token=secret',
      }),
    };
    service = new ElectoralCatalogArtifactService(
      gateway as unknown as SupabaseStorageGateway,
    );
    fetchMock = jest.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          'content-length': String(bytes.byteLength),
          'content-type': 'application/json; charset=utf-8',
        },
      }),
    );
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  it('downloads only through a short-lived signed URL and verifies size, hash and UTF-8', async () => {
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).resolves.toBe(content);

    expect(gateway.createSignedDownloadUrl).toHaveBeenCalledWith(path, 120);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://private-storage.example/object?token=secret',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
      }),
    );
  });

  it.each([0, -1, 1.5, RNEC_CATALOG_MAX_CONTENT_BYTES + 1])(
    'rejects unverifiable expected size %s before contacting Storage',
    async (size) => {
      await expect(
        service.loadVerifiedJson(path, size, sha256),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.createSignedDownloadUrl).not.toHaveBeenCalled();
    },
  );

  it('rejects changed content length, MIME type, actual size and digest', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        headers: {
          'content-length': '999',
          'content-type': 'application/json',
        },
      }),
    );
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toBeInstanceOf(BadRequestException);

    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        headers: {
          'content-length': String(bytes.byteLength),
          'content-type': 'text/plain',
        },
      }),
    );
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toBeInstanceOf(BadRequestException);

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([...bytes, 32]), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toBeInstanceOf(BadRequestException);

    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid UTF-8 after byte-integrity verification', async () => {
    const invalid = new Uint8Array([0xc3, 0x28]);
    const digest = createHash('sha256').update(invalid).digest('hex');
    fetchMock.mockResolvedValueOnce(
      new Response(invalid, {
        headers: {
          'content-length': '2',
          'content-type': 'application/json',
        },
      }),
    );

    await expect(service.loadVerifiedJson(path, 2, digest)).rejects.toThrow(
      'UTF-8',
    );
  });

  it('fails closed without exposing a signed URL when authorization or download fails', async () => {
    gateway.createSignedDownloadUrl.mockRejectedValueOnce(
      new Error('token=secret-storage-token'),
    );
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toEqual(
      expect.objectContaining({
        response: expect.not.stringContaining('secret-storage-token'),
      }),
    );

    gateway.createSignedDownloadUrl.mockResolvedValueOnce({
      signedUrl: 'https://private-storage.example/object?token=secret',
    });
    fetchMock.mockRejectedValueOnce(new Error('network token=secret'));
    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects non-success Storage responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(
      service.loadVerifiedJson(path, bytes.byteLength, sha256),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
