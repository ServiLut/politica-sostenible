import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ElectoralCatalogImportController } from './electoral-catalog-import.controller';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';

describe('ElectoralCatalogImportController', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const service = {
    create: jest.fn(),
    list: jest.fn(),
    detail: jest.fn(),
    retry: jest.fn(),
  };
  const controller = new ElectoralCatalogImportController(
    service as unknown as ElectoralCatalogImportService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates every operation with the authenticated context', async () => {
    const createDto = { clientRequestId: 'request-a' } as never;
    service.create.mockResolvedValue({ queued: true });
    service.list.mockResolvedValue([]);
    service.detail.mockResolvedValue({ id: 'import-a' });
    service.retry.mockResolvedValue({ queued: true });

    await controller.create(user, createDto);
    await controller.list(user, { limit: 10 });
    await controller.detail(user, { id: 'import-a' });
    await controller.retry(user, { id: 'import-a' });

    expect(service.create).toHaveBeenCalledWith(user, createDto);
    expect(service.list).toHaveBeenCalledWith(user, { limit: 10 });
    expect(service.detail).toHaveBeenCalledWith(user, 'import-a');
    expect(service.retry).toHaveBeenCalledWith(user, 'import-a');
  });

  it('allows reviewers to read while restricting mutation to ADMIN', () => {
    const reflector = new Reflector();
    expect(
      reflector.get<Role[]>(ROLES_KEY, ElectoralCatalogImportController),
    ).toEqual([Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR]);
    expect(
      reflector.get<Role[]>(
        ROLES_KEY,
        ElectoralCatalogImportController.prototype.create,
      ),
    ).toEqual([Role.ADMIN]);
    expect(
      reflector.get<Role[]>(
        ROLES_KEY,
        ElectoralCatalogImportController.prototype.retry,
      ),
    ).toEqual([Role.ADMIN]);
    expect(
      reflector.get(
        OPERATION_STAGE_POLICY_KEY,
        ElectoralCatalogImportController,
      ),
    ).toEqual({ kind: 'BLOCK_CLOSED' });
  });
});
