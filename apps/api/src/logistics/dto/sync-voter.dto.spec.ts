import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SyncVoterDto } from './sync-voter.dto';

const validInput = {
  documentId: '1012345678',
  firstName: 'Ana',
  lastName: 'Rojas',
  consentAccepted: true,
  termsVersion: '2026.1',
};

describe('SyncVoterDto phone normalization', () => {
  it.each([
    ['300 123 4567', '3001234567'],
    ['(300) 123-4567', '3001234567'],
    ['+57 (300) 123-4567', '+573001234567'],
  ])('canonicalizes a formatted phone %s', async (phone, expected) => {
    const dto = plainToInstance(SyncVoterDto, { ...validInput, phone });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.phone).toBe(expected);
  });

  it.each(['phone@example.test', '++573001234567', '123456'])(
    'rejects a non-canonicalizable phone %s',
    async (phone) => {
      const errors = await validate(
        plainToInstance(SyncVoterDto, { ...validInput, phone }),
      );

      expect(errors.map(({ property }) => property)).toContain('phone');
    },
  );
});
