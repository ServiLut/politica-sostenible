import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TransitionHandoverController } from './transition-handover.controller';
import type { TransitionHandoverService } from './transition-handover.service';

describe('TransitionHandoverController', () => {
  const user: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const allowedRoles = [Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR];

  it('generates with authenticated context only and restricts the endpoint', async () => {
    const service = {
      generateHandoverReport: jest.fn(),
      listHandoverReports: jest.fn(),
      getHandoverReport: jest.fn(),
    };
    const controller = new TransitionHandoverController(
      service as unknown as TransitionHandoverService,
    );
    service.generateHandoverReport.mockResolvedValue({ status: 'READY' });

    await expect(controller.getHandoverReport(user)).resolves.toEqual({
      status: 'READY',
    });
    expect(service.generateHandoverReport).toHaveBeenCalledWith(user);
    expect(
      new Reflector().get<Role[]>(
        ROLES_KEY,
        TransitionHandoverController.prototype.getHandoverReport,
      ),
    ).toEqual(allowedRoles);
  });

  it('lists minimized records with validated pagination and no client tenant', async () => {
    const service = {
      generateHandoverReport: jest.fn(),
      listHandoverReports: jest.fn().mockResolvedValue({ items: [] }),
      getHandoverReport: jest.fn(),
    };
    const controller = new TransitionHandoverController(
      service as unknown as TransitionHandoverService,
    );

    await expect(
      controller.listHandoverReports(user, { page: 2, limit: 10 }),
    ).resolves.toEqual({ items: [] });
    expect(service.listHandoverReports).toHaveBeenCalledWith(user, 2, 10);
    expect(
      new Reflector().get<Role[]>(
        ROLES_KEY,
        TransitionHandoverController.prototype.listHandoverReports,
      ),
    ).toEqual(allowedRoles);
  });

  it('retrieves the exact stored report by ID under the authenticated context', async () => {
    const service = {
      generateHandoverReport: jest.fn(),
      listHandoverReports: jest.fn(),
      getHandoverReport: jest.fn().mockResolvedValue({ reportId: 'report-a' }),
    };
    const controller = new TransitionHandoverController(
      service as unknown as TransitionHandoverService,
    );

    await expect(
      controller.getStoredHandoverReport(user, 'report-a'),
    ).resolves.toEqual({ reportId: 'report-a' });
    expect(service.getHandoverReport).toHaveBeenCalledWith(user, 'report-a');
    expect(
      new Reflector().get<Role[]>(
        ROLES_KEY,
        TransitionHandoverController.prototype.getStoredHandoverReport,
      ),
    ).toEqual(allowedRoles);
  });
});
