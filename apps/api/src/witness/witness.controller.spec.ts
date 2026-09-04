import { Role, WitnessReportStatus } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WitnessController } from './witness.controller';
import { WitnessService } from './witness.service';

describe('WitnessController RBAC and JWT context', () => {
  it('declares the real read, review and profile role matrices', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        WitnessController.prototype.findAll,
      ) as Role[],
    ).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.ZONE_COORDINATOR,
      Role.WITNESS,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        WitnessController.prototype.review,
      ) as Role[],
    ).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.COMPLIANCE_OFFICER,
      Role.ZONE_COORDINATOR,
    ]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        WitnessController.prototype.updatePollingPlaceProfile,
      ) as Role[],
    ).toEqual([Role.ADMIN, Role.CAMPAIGN_MANAGER]);
  });

  it('passes tenant and reviewer exclusively from the authenticated JWT context', async () => {
    const review = jest.fn().mockResolvedValue({ id: 'report-a' });
    const controller = new WitnessController({
      review,
    } as unknown as WitnessService);
    const user: AuthenticatedUser = {
      tenantId: 'tenant-from-jwt',
      userId: 'reviewer-from-jwt',
      role: Role.COMPLIANCE_OFFICER,
    };
    const dto = {
      status: WitnessReportStatus.REJECTED as const,
      reviewReason: 'Los totales requieren una nueva evidencia legible.',
    };

    await controller.review(user, { id: 'report-a' }, dto);

    expect(review).toHaveBeenCalledWith(
      'tenant-from-jwt',
      'reviewer-from-jwt',
      'report-a',
      dto,
    );
  });
});
