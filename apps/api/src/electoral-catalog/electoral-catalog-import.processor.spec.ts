import type { Job } from 'bullmq';
import { ElectoralCatalogImportProcessor } from './electoral-catalog-import.processor';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';
import {
  ELECTORAL_CATALOG_IMPORT_JOB,
  type ElectoralCatalogImportQueueData,
} from './electoral-catalog-queue.constants';

describe('ElectoralCatalogImportProcessor', () => {
  const imports = { process: jest.fn() };
  const processor = new ElectoralCatalogImportProcessor(
    imports as unknown as ElectoralCatalogImportService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates a valid, tenant-bound job', async () => {
    imports.process.mockResolvedValue({ releaseId: 'release-a' });
    const job = {
      name: ELECTORAL_CATALOG_IMPORT_JOB,
      data: { importJobId: 'import-a', tenantId: 'tenant-a' },
    } as Job<ElectoralCatalogImportQueueData>;

    await expect(processor.process(job)).resolves.toEqual({
      releaseId: 'release-a',
    });
    expect(imports.process).toHaveBeenCalledWith('import-a', 'tenant-a');
  });

  it.each([
    ['wrong-name', { importJobId: 'import-a', tenantId: 'tenant-a' }],
    [
      ELECTORAL_CATALOG_IMPORT_JOB,
      { importJobId: '../a', tenantId: 'tenant-a' },
    ],
    [ELECTORAL_CATALOG_IMPORT_JOB, { importJobId: 'import-a', tenantId: '' }],
  ])('rejects malformed or unexpected queue input', (name, data) => {
    expect(() =>
      processor.process({ name, data } as Job<ElectoralCatalogImportQueueData>),
    ).toThrow('invalido');
    expect(imports.process).not.toHaveBeenCalled();
  });
});
