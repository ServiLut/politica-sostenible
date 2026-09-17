import { Injectable } from '@nestjs/common';
import { STORAGE_MAX_UPLOAD_BYTES } from './storage.constants';
import {
  readAndHashStorageObject,
  type StorageIntegrityObservation,
} from './storage-integrity-stream';
import { SupabaseStorageGateway } from './supabase-storage.gateway';

export interface StorageIntegrityReadTarget {
  readonly path: string;
  readonly expectedSha256: string;
  readonly expectedSize: number;
  readonly contentType: string;
}

@Injectable()
export class StorageIntegrityByteReader {
  constructor(private readonly gateway: SupabaseStorageGateway) {}

  async read(
    target: StorageIntegrityReadTarget,
  ): Promise<Required<StorageIntegrityObservation>> {
    // A fresh short-lived URL is generated for every attempt. It is retained
    // only in memory and never written to a job, database field, audit or log.
    const signed = await this.gateway.createSignedDownloadUrl(target.path, 120);
    return readAndHashStorageObject({
      url: signed.signedUrl,
      expectedSha256: target.expectedSha256,
      expectedSize: target.expectedSize,
      expectedContentType: target.contentType,
      maximumBytes: STORAGE_MAX_UPLOAD_BYTES,
    });
  }
}
