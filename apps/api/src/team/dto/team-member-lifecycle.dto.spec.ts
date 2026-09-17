import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  TeamMemberParamsDto,
  UpdateTeamMemberDivisionDto,
} from './team-member-lifecycle.dto';

const MEMBER_ID = `c${'1'.repeat(24)}`;
const DIVISION_ID = `c${'2'.repeat(24)}`;

describe('team member lifecycle identifier validation', () => {
  it('accepts only canonical persisted CUID identifiers', async () => {
    await expect(
      validate(plainToInstance(TeamMemberParamsDto, { memberId: MEMBER_ID })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(UpdateTeamMemberDivisionDto, {
          divisionId: DIVISION_ID,
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it.each(['member-a', MEMBER_ID.toUpperCase(), `${MEMBER_ID}/child`, ''])(
    'rejects a non-canonical member id: %s',
    async (memberId) => {
      expect(
        await validate(plainToInstance(TeamMemberParamsDto, { memberId })),
      ).not.toHaveLength(0);
    },
  );

  it('keeps null as the explicit unassignment command', async () => {
    await expect(
      validate(
        plainToInstance(UpdateTeamMemberDivisionDto, { divisionId: null }),
      ),
    ).resolves.toHaveLength(0);
  });
});
