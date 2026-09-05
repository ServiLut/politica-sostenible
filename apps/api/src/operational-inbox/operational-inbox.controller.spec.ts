import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ListOperationalInboxQueryDto } from './dto/list-operational-inbox-query.dto';
import {
  OPERATIONAL_INBOX_ROLES,
  OperationalInboxController,
} from './operational-inbox.controller';

describe('OperationalInboxController contract', () => {
  it('declares only coordination, direction and specialist review roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OperationalInboxController)).toEqual(
      OPERATIONAL_INBOX_ROLES,
    );
    expect(OPERATIONAL_INBOX_ROLES).not.toContain(Role.VOLUNTEER);
    expect(OPERATIONAL_INBOX_ROLES).not.toContain(Role.WITNESS);
    expect(OPERATIONAL_INBOX_ROLES).not.toContain(Role.FINANCE_MANAGER);
  });

  it.each([0, 101, 1.5, 'not-a-number'])(
    'rejects an unsafe result limit: %p',
    async (limit) => {
      const dto = plainToInstance(ListOperationalInboxQueryDto, { limit });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('transforms and accepts a bounded result limit', async () => {
    const dto = plainToInstance(ListOperationalInboxQueryDto, { limit: '75' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(75);
  });
});
