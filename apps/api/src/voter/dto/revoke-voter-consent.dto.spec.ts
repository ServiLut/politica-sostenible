import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevokeVoterConsentDto } from './revoke-voter-consent.dto';

describe('RevokeVoterConsentDto', () => {
  it('trims and accepts a meaningful reason', async () => {
    const dto = plainToInstance(RevokeVoterConsentDto, {
      reason: '  Solicitud expresa del titular.  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.reason).toBe('Solicitud expresa del titular.');
  });

  it.each(['', '        ', 'muy corta'])(
    'rejects short reason %p',
    async (reason) => {
      const errors = await validate(
        plainToInstance(RevokeVoterConsentDto, { reason }),
      );

      expect(errors).not.toHaveLength(0);
    },
  );

  it('rejects reasons longer than 500 characters', async () => {
    const errors = await validate(
      plainToInstance(RevokeVoterConsentDto, { reason: 'x'.repeat(501) }),
    );

    expect(errors).not.toHaveLength(0);
  });
});
