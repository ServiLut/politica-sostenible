import { HEADERS_METADATA } from '@nestjs/common/constants';
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

describe('TeamController access reset', () => {
  const handler = TeamController.prototype.resetMemberAccess;

  it('delegates only the JWT identity and validated route member id', async () => {
    const temporaryPasswordExpiresAt = new Date('2026-09-03T12:00:00.000Z');
    const resetMemberAccess = jest.fn().mockResolvedValue({
      memberId: 'member-a',
      temporaryPassword: 'one-time-secret',
      temporaryPasswordExpiresAt,
    });
    const controller = new TeamController({
      resetMemberAccess,
    } as unknown as TeamService);
    const user: AuthenticatedUser = {
      userId: 'admin-a',
      tenantId: 'tenant-a',
      role: Role.ADMIN,
    };

    await expect(
      controller.resetMemberAccess(user, { memberId: 'member-a' }),
    ).resolves.toEqual({
      memberId: 'member-a',
      temporaryPassword: 'one-time-secret',
      temporaryPasswordExpiresAt,
    });
    expect(resetMemberAccess).toHaveBeenCalledWith(user, 'member-a');
  });

  it('marks the one-time secret response as private and non-cacheable', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'no-store, private' },
        { name: 'Pragma', value: 'no-cache' },
      ]),
    );
  });

  it('applies a strict hourly throttle to administrative resets', () => {
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(5);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(
      3_600_000,
    );
    expect(
      Reflect.getMetadata(`${THROTTLER_BLOCK_DURATION}default`, handler),
    ).toBe(3_600_000);
  });
});
