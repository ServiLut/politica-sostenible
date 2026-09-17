import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ElectoralCatalogController } from './electoral-catalog.controller';
import { ElectoralCatalogService } from './electoral-catalog.service';

describe('ElectoralCatalogController', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const service = {
    listReleases: jest.fn(),
    getRelease: jest.fn(),
    diffRelease: jest.fn(),
    getReleaseGaps: jest.fn(),
    validateRelease: jest.fn(),
    activateRelease: jest.fn(),
  };
  const controller = new ElectoralCatalogController(
    service as unknown as ElectoralCatalogService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates every route with the authenticated tenant context', async () => {
    service.listReleases.mockResolvedValue([]);
    service.getRelease.mockResolvedValue({ release: { id: 'release-a' } });
    service.diffRelease.mockResolvedValue({ summary: {} });
    service.getReleaseGaps.mockResolvedValue({ integrity: {} });
    service.validateRelease.mockResolvedValue({ validated: true });
    service.activateRelease.mockResolvedValue({ activated: true });
    const integrity = { expectedContentSha256: 'a'.repeat(64) };

    await controller.list(user, { limit: 10 });
    await controller.detail(user, { id: 'release-a' }, { entryLimit: 20 });
    await controller.diff(
      user,
      { id: 'release-a' },
      { againstReleaseId: 'release-b' },
    );
    await controller.gaps(user, { id: 'release-a' });
    await controller.validate(user, { id: 'release-a' }, integrity);
    await controller.activate(user, { id: 'release-a' }, integrity);

    expect(service.listReleases).toHaveBeenCalledWith(user, { limit: 10 });
    expect(service.getRelease).toHaveBeenCalledWith(user, 'release-a', {
      entryLimit: 20,
    });
    expect(service.diffRelease).toHaveBeenCalledWith(user, 'release-a', {
      againstReleaseId: 'release-b',
    });
    expect(service.getReleaseGaps).toHaveBeenCalledWith(user, 'release-a');
    expect(service.validateRelease).toHaveBeenCalledWith(
      user,
      'release-a',
      integrity,
    );
    expect(service.activateRelease).toHaveBeenCalledWith(
      user,
      'release-a',
      integrity,
    );
  });

  it('restricts the entire controller to authorized catalog reviewers', () => {
    const roles = new Reflector().get<Role[]>(
      ROLES_KEY,
      ElectoralCatalogController,
    );

    expect(roles).toEqual([Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR]);
    expect(
      new Reflector().get(
        OPERATION_STAGE_POLICY_KEY,
        ElectoralCatalogController,
      ),
    ).toEqual({ kind: 'BLOCK_CLOSED' });
  });

  it('does not expose raw staging or upload as an HTTP method', () => {
    const prototype = ElectoralCatalogController.prototype as unknown as Record<
      string,
      unknown
    >;

    expect(prototype.stage).toBeUndefined();
    expect(prototype.create).toBeUndefined();
    expect(prototype.upload).toBeUndefined();
  });
});
