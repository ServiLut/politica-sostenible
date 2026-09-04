import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { VoterController } from './voter.controller';
import {
  VOTER_DATA_RIGHTS_ROLES,
  VoterDataRightsService,
} from './voter-data-rights.service';
import {
  VOTER_CONSENT_GRANT_ROLES,
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

  it('exposes explicit consent reauthorization only to operational privacy roles', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      VoterController.prototype.grantConsent,
    );

    expect(roles).toEqual(VOTER_CONSENT_GRANT_ROLES);
    expect(roles).toContain(Role.ZONE_COORDINATOR);
    expect(roles).toContain(Role.COMPLIANCE_OFFICER);
    expect(roles).not.toContain(Role.VOLUNTEER);
    expect(roles).not.toContain(Role.AUDITOR);
  });

  it('delegates reauthorization without accepting tenant or actor from the body', async () => {
    const grantConsent = jest.fn().mockResolvedValue({
      voterId: 'voter-a',
      consentAccepted: true,
      status: 'GRANTED',
    });
    const controller = new VoterController(
      { grantConsent } as unknown as VoterService,
      {} as VoterDataRightsService,
    );
    const user: AuthenticatedUser = {
      userId: 'coordinator-a',
      tenantId: 'tenant-a',
      role: Role.ZONE_COORDINATOR,
    };
    const dto = {
      consentAccepted: true as const,
      termsVersion: '2026.1',
      collectionChannel: 'IN_PERSON' as const,
    };

    await controller.grantConsent(user, { id: 'voter-a' }, '203.0.113.42', dto);

    expect(grantConsent).toHaveBeenCalledWith(
      user,
      'voter-a',
      '203.0.113.42',
      dto,
    );
  });
});
