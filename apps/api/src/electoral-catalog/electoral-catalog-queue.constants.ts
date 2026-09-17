export const ELECTORAL_CATALOG_QUEUE = 'electoral-catalog-imports';
export const ELECTORAL_CATALOG_IMPORT_JOB = 'stage-rnec-catalog';

export interface ElectoralCatalogImportQueueData {
  readonly importJobId: string;
  readonly tenantId: string;
}

export const ELECTORAL_CATALOG_QUEUE_PORT = Symbol(
  'ELECTORAL_CATALOG_QUEUE_PORT',
);

export interface ElectoralCatalogQueuePort {
  enqueue(data: ElectoralCatalogImportQueueData): Promise<void>;
  checkReady(): Promise<void>;
}
