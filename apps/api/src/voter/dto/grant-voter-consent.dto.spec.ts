import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentCollectionChannel } from '../../../prisma/generated/prisma';
import { GrantVoterConsentDto } from './grant-voter-consent.dto';

describe('GrantVoterConsentDto', () => {
  it('accepts the supported notice after an explicit confirmation', async () => {
    const dto = plainToInstance(GrantVoterConsentDto, {
      consentAccepted: true,
      termsVersion: '2026.1',
      collectionChannel: ConsentCollectionChannel.PHONE,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    {
      consentAccepted: false,
      termsVersion: '2026.1',
      collectionChannel: ConsentCollectionChannel.PHONE,
    },
    {
      consentAccepted: true,
      termsVersion: 'version con espacios',
      collectionChannel: ConsentCollectionChannel.PHONE,
    },
    {
      consentAccepted: true,
      termsVersion: '2026.1',
      collectionChannel: ConsentCollectionChannel.IMPORT,
    },
    {
      termsVersion: '2026.1',
      collectionChannel: ConsentCollectionChannel.PHONE,
    },
  ])('rejects an invalid reauthorization payload %#', async (payload) => {
    const errors = await validate(
      plainToInstance(GrantVoterConsentDto, payload),
    );

    expect(errors).not.toHaveLength(0);
  });

  it('rejects tenant, actor and evidence fields supplied by the client', async () => {
    const dto = plainToInstance(GrantVoterConsentDto, {
      consentAccepted: true,
      termsVersion: '2026.1',
      collectionChannel: ConsentCollectionChannel.PHONE,
      tenantId: 'tenant-attacker',
      capturedById: 'actor-attacker',
      sourceIpHash: 'forged-proof',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'tenantId',
        'capturedById',
        'sourceIpHash',
        'grantedAt',
      ]),
    );
  });
});
