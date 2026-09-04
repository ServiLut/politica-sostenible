import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { VoterController } from './voter.controller';
import {
  VOTER_DATA_RIGHTS_ROLES,
  VoterDataRightsService,
} from './voter-data-rights.service';
import {
  VOTER_CAPTURE_ROLES,
  VOTER_READ_ROLES,
  VoterService,
} from './voter.service';

describe('VoterController private search', () => {
  const handler = VoterController.prototype.search;

  it('uses the same voter-read RBAC allowlist', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(VOTER_READ_ROLES);
  });

  it('delegates only authenticated identity and validated body', async () => {
    const search = jest.fn().mockResolvedValue({ items: [], pagination: {} });
    const controller = new VoterController(
      { search } as unknown as VoterService,
      {} as VoterDataRightsService,
    );
    const user: AuthenticatedUser = {
      userId: 'auditor-a',
      tenantId: 'tenant-a',
      role: Role.AUDITOR,
    };
    const dto = { page: 2, limit: 10, search: '1012345678' };

    await controller.search(user, dto);

    expect(search).toHaveBeenCalledWith(user, dto);
  });

  it('keeps protected-detail roles narrower than list/search roles', () => {
    expect(VOTER_READ_ROLES).toContain(Role.AUDITOR);
    expect(VOTER_DATA_RIGHTS_ROLES).not.toContain(Role.AUDITOR);
  });

  it('limits capture context to territorial collectors', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      VoterController.prototype.getCaptureContext,
    );

    expect(roles).toEqual(VOTER_CAPTURE_ROLES);
    expect(roles).toEqual([Role.ZONE_COORDINATOR, Role.VOLUNTEER]);
    expect(roles).not.toContain(Role.ADMIN);
  });

  it('delegates capture context using only the authenticated identity', async () => {
    const getCaptureContext = jest.fn().mockResolvedValue({ puestos: [] });
    const controller = new VoterController(
      { getCaptureContext } as unknown as VoterService,
      {} as VoterDataRightsService,
    );
    const user: AuthenticatedUser = {
      userId: 'volunteer-a',
      tenantId: 'tenant-a',
      role: Role.VOLUNTEER,
    };

    await controller.getCaptureContext(user);

    expect(getCaptureContext).toHaveBeenCalledWith(user);
    expect(getCaptureContext).toHaveBeenCalledTimes(1);
  });
});
