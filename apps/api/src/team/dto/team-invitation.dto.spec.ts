import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../../prisma/generated/prisma';
import { AcceptTeamInvitationDto } from './accept-team-invitation.dto';
import { CreateTeamInvitationDto } from './create-team-invitation.dto';
import {
  TeamMemberParamsDto,
  UpdateTeamMemberRoleDto,
  UpdateTeamMemberStatusDto,
} from './team-member-lifecycle.dto';

describe('Team invitation DTO validation', () => {
  it('normalizes an invitation email before validation', async () => {
    const dto = plainToInstance(CreateTeamInvitationDto, {
      email: '  Persona@Example.TEST ',
      role: Role.VOLUNTEER,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('persona@example.test');
  });

  it('rejects malformed acceptance data and stale terms', async () => {
    const dto = plainToInstance(AcceptTeamInvitationDto, {
      token: 'short',
      password: 'short',
      name: '',
      documentId: '123 456',
      phone: 'not-a-phone',
      termsAccepted: false,
      termsVersion: '2025.1',
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining([
        'token',
        'password',
        'name',
        'documentId',
        'phone',
        'termsAccepted',
        'termsVersion',
      ]),
    );
  });

  it('accepts a complete 2026.1 acceptance payload', async () => {
    const dto = plainToInstance(AcceptTeamInvitationDto, {
      token: 'a'.repeat(43),
      password: 'una-clave-segura-2026',
      name: '  Ana Perez  ',
      documentId: '  1012345678 ',
      phone: '  +573001234567 ',
      termsAccepted: true,
      termsVersion: '2026.1',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Ana Perez',
      documentId: '1012345678',
      phone: '+573001234567',
    });
  });

  it('validates strict member lifecycle inputs without coercing status', async () => {
    const params = plainToInstance(TeamMemberParamsDto, {
      memberId: 'member_valid-123',
    });
    const role = plainToInstance(UpdateTeamMemberRoleDto, {
      role: Role.VOLUNTEER,
    });
    const status = plainToInstance(UpdateTeamMemberStatusDto, {
      isActive: false,
    });

    await expect(validate(params)).resolves.toHaveLength(0);
    await expect(validate(role)).resolves.toHaveLength(0);
    await expect(validate(status)).resolves.toHaveLength(0);
  });

  it('rejects unsafe member ids, unknown roles and string statuses', async () => {
    const params = plainToInstance(TeamMemberParamsDto, {
      memberId: '../tenant-b/member',
    });
    const role = plainToInstance(UpdateTeamMemberRoleDto, {
      role: 'SUPER_ADMIN',
    });
    const status = plainToInstance(UpdateTeamMemberStatusDto, {
      isActive: 'false',
    });

    await expect(validate(params)).resolves.not.toHaveLength(0);
    await expect(validate(role)).resolves.not.toHaveLength(0);
    await expect(validate(status)).resolves.not.toHaveLength(0);
  });
});
