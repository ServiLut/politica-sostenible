import { createHash } from 'node:crypto';
import { PersonImportArtifactService } from './person-import-artifact.service';
import { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';

describe('Person import source bytes', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  function service(
    policy = {
      maxBytes: null as number | null,
      allowedMimeTypes: null as string[] | null,
    },
  ) {
    return new PersonImportArtifactService({
      getUploadPolicy: jest.fn().mockResolvedValue(policy),
      createSignedDownloadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://storage.invalid/private.csv?token=private',
      }),
    } as unknown as SupabaseStorageGateway);
  }
  it('advertises the actual private bucket limit and never more than 20 MiB', async () => {
    expect(
      await service({
        maxBytes: 10 * 1024 * 1024,
        allowedMimeTypes: ['text/csv'],
      }).maximumBytes(),
    ).toBe(10 * 1024 * 1024);
    expect(await service().maximumBytes()).toBe(20 * 1024 * 1024);
    expect(
      await service({
        maxBytes: 30 * 1024 * 1024,
        allowedMimeTypes: ['text/*'],
      }).maximumBytes(),
    ).toBe(20 * 1024 * 1024);
    await expect(
      service({
        maxBytes: null,
        allowedMimeTypes: ['application/pdf'],
      }).maximumBytes(),
    ).rejects.toThrow('no admite');
  });
  it('verifies the full stream before exposing any row to processing', async () => {
    const source = Buffer.from('Documento,Nombre\n12345,PRUEBA');
    global.fetch = jest.fn().mockResolvedValue(new Response(source));
    const consume = jest.fn(async (chunks: AsyncIterable<Uint8Array>) => {
      let size = 0;
      for await (const chunk of chunks) size += chunk.length;
      return size;
    });
    await expect(
      service().withVerifiedCsv(
        'tenant/person-import/source.csv',
        source.length,
        createHash('sha256').update(source).digest('hex'),
        consume,
      ),
    ).resolves.toBe(source.length);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(consume).toHaveBeenCalledTimes(1);
  });
  it('announces the smaller real bucket limit for consent evidence and never exceeds the 15 MiB policy', async () => {
    expect(
      await service({
        maxBytes: 10 * 1024 * 1024,
        allowedMimeTypes: ['text/csv', 'application/pdf'],
      }).uploadLimits(),
    ).toEqual({
      maxBytes: 10 * 1024 * 1024,
      maxEvidenceBytes: 10 * 1024 * 1024,
    });
    expect(
      (
        await service({
          maxBytes: 30 * 1024 * 1024,
          allowedMimeTypes: null,
        }).uploadLimits()
      ).maxEvidenceBytes,
    ).toBe(15 * 1024 * 1024);
    expect((await service().uploadLimits()).maxEvidenceBytes).toBe(
      15 * 1024 * 1024,
    );
  });
  it.each(['hash', 'size'])(
    'rejects a %s mismatch without calling the consumer',
    async (caseName) => {
      const source = Buffer.from('PRUEBA');
      global.fetch = jest.fn().mockResolvedValue(new Response(source));
      const consume = jest.fn();
      await expect(
        service().withVerifiedCsv(
          'tenant/person-import/source.csv',
          caseName === 'size' ? 2 : source.length,
          '0'.repeat(64),
          consume,
        ),
      ).rejects.toThrow();
      expect(consume).not.toHaveBeenCalled();
    },
  );
  it('rejects the size limit without fetching private bytes', async () => {
    global.fetch = jest.fn();
    await expect(
      service().withVerifiedCsv(
        'unused',
        20 * 1024 * 1024 + 1,
        '0'.repeat(64),
        jest.fn(),
      ),
    ).rejects.toThrow('20 MiB');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
