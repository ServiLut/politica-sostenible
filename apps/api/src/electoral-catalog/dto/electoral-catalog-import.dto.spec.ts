import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ElectoralCatalogImportStatus } from '../../../prisma/generated/prisma';
import {
  CreateElectoralCatalogImportDto,
  ElectoralCatalogImportIdParamsDto,
  ListElectoralCatalogImportsQueryDto,
} from './electoral-catalog-import.dto';

const validImport = {
  clientRequestId: '7c8f80d8-66c5-4f3a-9745-b66219c13f74',
  catalogKey: 'RNEC-PRESIDENCIA-2026',
  sourceUrl: 'https://www.registraduria.gov.co/fuente-oficial.json',
  sourceDataset: 'DIVIPOLE Presidencia 2026',
  sourceCutoffAt: '2026-09-08T12:30:00.000Z',
  electionDate: '2026-05-31',
  authorizationReference: 'Autorizacion escrita RNEC 2026-001',
  licenseDeclaration: 'Uso autorizado para operacion electoral interna',
  sourceArtifactPath:
    'tenant-a/electoral-catalog/7c8f80d8-66c5-4f3a-9745-b66219c13f74.json',
  expectedContentSha256: 'a'.repeat(64),
};

describe('electoral catalog import DTOs', () => {
  it('accepts and trims a complete immutable import request', async () => {
    const dto = plainToInstance(CreateElectoralCatalogImportDto, {
      ...validImport,
      catalogKey: `  ${validImport.catalogKey}  `,
      sourceDataset: ` ${validImport.sourceDataset} `,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.catalogKey).toBe(validImport.catalogKey);
    expect(dto.sourceDataset).toBe(validImport.sourceDataset);
  });

  it.each([
    ['non-UUID idempotency key', { clientRequestId: 'request-1' }],
    ['non-HTTPS source', { sourceUrl: 'http://registraduria.gov.co/data' }],
    ['invalid election date', { electionDate: '2026-02-31T00:00:00Z' }],
    [
      'cross-module artifact path',
      {
        sourceArtifactPath:
          'tenant-a/e14/7c8f80d8-66c5-4f3a-9745-b66219c13f74.json',
      },
    ],
    ['uppercase digest', { expectedContentSha256: 'A'.repeat(64) }],
    ['missing authorization', { authorizationReference: '' }],
  ])('rejects %s', async (_label, patch) => {
    const dto = plainToInstance(CreateElectoralCatalogImportDto, {
      ...validImport,
      ...patch,
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('bounds list pagination and validates status and route identifiers', async () => {
    const query = plainToInstance(ListElectoralCatalogImportsQueryDto, {
      status: ElectoralCatalogImportStatus.FAILED,
      limit: '100',
    });
    const invalidQuery = plainToInstance(ListElectoralCatalogImportsQueryDto, {
      status: 'UNKNOWN',
      limit: '101',
    });
    const params = plainToInstance(ElectoralCatalogImportIdParamsDto, {
      id: 'job-safe_123',
    });
    const invalidParams = plainToInstance(ElectoralCatalogImportIdParamsDto, {
      id: '../tenant-b/job',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query.limit).toBe(100);
    expect(await validate(invalidQuery)).not.toHaveLength(0);
    expect(await validate(params)).toHaveLength(0);
    expect(await validate(invalidParams)).not.toHaveLength(0);
  });
});
