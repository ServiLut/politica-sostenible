import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ElectoralCatalogStatus,
  ElectoralCatalogType,
} from '../../../prisma/generated/prisma';
import {
  CatalogReleaseDetailQueryDto,
  CatalogReleaseDiffQueryDto,
  CatalogReleaseIdParamsDto,
  CatalogReleaseIntegrityDto,
  ListCatalogReleasesQueryDto,
} from './catalog-release.dto';

describe('electoral catalog HTTP DTOs', () => {
  it('accepts bounded tenant-agnostic list and detail filters', async () => {
    const list = plainToInstance(ListCatalogReleasesQueryDto, {
      type: ElectoralCatalogType.ELECTORAL_RNEC,
      status: ElectoralCatalogStatus.VALIDATED,
      limit: '25',
      tenantId: 'attacker-tenant',
    });
    const detail = plainToInstance(CatalogReleaseDetailQueryDto, {
      entryLimit: '100',
      entryCursorId: 'entry_123',
    });

    await expect(validate(list)).resolves.toHaveLength(0);
    await expect(validate(detail)).resolves.toHaveLength(0);
    expect(list.limit).toBe(25);
    expect(detail.entryLimit).toBe(100);
    expect('tenantId' in new ListCatalogReleasesQueryDto()).toBe(false);
  });

  it.each([
    [CatalogReleaseIdParamsDto, { id: '../tenant-b' }],
    [CatalogReleaseDetailQueryDto, { entryLimit: 501 }],
    [CatalogReleaseDiffQueryDto, { againstReleaseId: '../release' }],
    [CatalogReleaseIntegrityDto, { expectedContentSha256: 'ABC' }],
    [ListCatalogReleasesQueryDto, { status: 'UNKNOWN' }],
  ])('rejects invalid transport input for %p', async (Dto, input) => {
    const instance = plainToInstance(Dto as ClassConstructor<object>, input);

    const errors = await validate(instance);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires the exact reviewed lowercase SHA-256', async () => {
    const valid = plainToInstance(CatalogReleaseIntegrityDto, {
      expectedContentSha256: 'a'.repeat(64),
    });
    const missing = plainToInstance(CatalogReleaseIntegrityDto, {});

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(missing)).length).toBeGreaterThan(0);
  });
});
