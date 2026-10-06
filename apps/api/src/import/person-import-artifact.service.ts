import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';
import { PERSON_IMPORT_MAX_BYTES } from './person-import.constants';
import {
  STORAGE_UPLOAD_POLICIES,
  StorageModuleName,
} from '../storage/storage.constants';

@Injectable()
export class PersonImportArtifactService {
  constructor(private readonly storage: SupabaseStorageGateway) {}

  async maximumBytes(): Promise<number> {
    return (await this.uploadLimits()).maxBytes;
  }

  async uploadLimits(): Promise<{
    maxBytes: number;
    maxEvidenceBytes: number;
  }> {
    const policy = await this.storage.getUploadPolicy();
    if (
      policy.allowedMimeTypes?.length &&
      !policy.allowedMimeTypes.some((mime) =>
        ['text/csv', 'text/*', '*/*'].includes(mime),
      )
    ) {
      throw new BadRequestException(
        'El bucket privado actual no admite archivos CSV',
      );
    }
    const evidenceMaximum =
      STORAGE_UPLOAD_POLICIES[StorageModuleName.CONSENT].maxBytes;
    return {
      maxBytes: Math.min(
        PERSON_IMPORT_MAX_BYTES,
        policy.maxBytes ?? PERSON_IMPORT_MAX_BYTES,
      ),
      maxEvidenceBytes: Math.min(
        evidenceMaximum,
        policy.maxBytes ?? evidenceMaximum,
      ),
    };
  }

  async withVerifiedCsv<T>(
    path: string,
    size: number,
    sha256: string,
    consume: (bytes: AsyncIterable<Uint8Array>) => Promise<T>,
  ): Promise<T> {
    if (size < 1 || size > PERSON_IMPORT_MAX_BYTES)
      throw new BadRequestException('CSV fuera del límite de 20 MiB');
    const signed = await this.storage.createSignedDownloadUrl(path, 120);
    const dir = await mkdtemp(join(tmpdir(), 'politica-person-import-'));
    const file = join(dir, 'source.csv');
    try {
      const response = await fetch(signed.signedUrl, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok || !response.body)
        throw new ServiceUnavailableException(
          'No fue posible leer el CSV privado',
        );
      const handle = await open(file, 'wx', 0o600);
      let total = 0;
      const hash = createHash('sha256');
      try {
        for await (const bytes of response.body) {
          total += bytes.length;
          if (total > size || total > PERSON_IMPORT_MAX_BYTES)
            throw new BadRequestException('El CSV excede el tamaño confirmado');
          hash.update(bytes);
          await handle.writeFile(bytes);
        }
      } finally {
        await handle.close();
      }
      if (total !== size || hash.digest('hex') !== sha256)
        throw new BadRequestException(
          'Los bytes del CSV no coinciden con su huella confirmada',
        );
      return await consume(createReadStream(file));
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
