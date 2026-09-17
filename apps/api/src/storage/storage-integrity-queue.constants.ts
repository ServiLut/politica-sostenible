export const STORAGE_INTEGRITY_QUEUE = 'storage-integrity-verification';
export const STORAGE_INTEGRITY_VERIFY_JOB = 'verify-stored-object-bytes';
export const STORAGE_INTEGRITY_QUEUE_PORT = Symbol(
  'STORAGE_INTEGRITY_QUEUE_PORT',
);

export interface StorageIntegrityQueueData {
  readonly tenantId: string;
  readonly storedObjectId: string;
}

export interface StorageIntegrityQueuePort {
  enqueue(data: StorageIntegrityQueueData): Promise<void>;
  checkReady(): Promise<void>;
}
