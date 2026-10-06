export const PERSON_IMPORT_QUEUE = 'person-import';
export const PERSON_IMPORT_JOB = 'validate-or-import-persons';
export const PERSON_IMPORT_QUEUE_PORT = Symbol('PERSON_IMPORT_QUEUE_PORT');
export const PERSON_IMPORT_MAX_ROWS = 50_000;
export const PERSON_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const PERSON_IMPORT_BATCH = 250;
export const PERSON_IMPORT_LEASE_MS = 120_000;
export interface PersonImportQueueData {
  importJobId: string;
  tenantId: string;
}
export interface PersonImportQueuePort {
  enqueue(data: PersonImportQueueData): Promise<void>;
  checkReady(): Promise<void>;
}
