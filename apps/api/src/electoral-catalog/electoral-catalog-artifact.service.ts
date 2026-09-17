import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';
import { RNEC_CATALOG_MAX_CONTENT_BYTES } from './rnec-divipole-tree.parser';

const DOWNLOAD_TTL_SECONDS = 120;
const DOWNLOAD_TIMEOUT_MS = 30_000;

@Injectable()
export class ElectoralCatalogArtifactService {
  constructor(private readonly storage: SupabaseStorageGateway) {}

  async loadVerifiedJson(
    path: string,
    expectedSize: number,
    expectedSha256: string,
  ): Promise<string> {
    if (
      !Number.isSafeInteger(expectedSize) ||
      expectedSize <= 0 ||
      expectedSize > RNEC_CATALOG_MAX_CONTENT_BYTES
    ) {
      throw new BadRequestException(
        'El artefacto electoral no tiene un tamano verificable permitido',
      );
    }

    let signed: { signedUrl: string };
    try {
      signed = await this.storage.createSignedDownloadUrl(
        path,
        DOWNLOAD_TTL_SECONDS,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Storage no permitio autorizar la lectura del artefacto electoral',
      );
    }
    let response: Response;
    try {
      response = await fetch(signed.signedUrl, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Storage no permitio leer el artefacto electoral confirmado',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Storage no entrego el artefacto electoral confirmado',
      );
    }

    const declaredLength = response.headers.get('content-length');
    if (
      declaredLength !== null &&
      (!/^\d+$/u.test(declaredLength) ||
        Number(declaredLength) !== expectedSize)
    ) {
      throw new BadRequestException(
        'El tamano descargado no coincide con el objeto confirmado',
      );
    }
    const contentType =
      response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? '';
    if (contentType && contentType !== 'application/json') {
      throw new BadRequestException(
        'El artefacto electoral confirmado dejo de ser application/json',
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength !== expectedSize ||
      bytes.byteLength > RNEC_CATALOG_MAX_CONTENT_BYTES
    ) {
      throw new BadRequestException(
        'El tamano descargado no coincide con el objeto confirmado',
      );
    }
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== expectedSha256) {
      throw new BadRequestException(
        'La huella SHA-256 del artefacto electoral no coincide con la declarada',
      );
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new BadRequestException(
        'El artefacto electoral no contiene texto UTF-8 valido',
      );
    }
  }
}
