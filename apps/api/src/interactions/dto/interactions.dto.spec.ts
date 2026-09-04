import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CommunicationChannel,
  ConsentCollectionChannel,
  InteractionDirection,
} from '../../../prisma/generated/prisma';
import { CreateInteractionDto } from './create-interaction.dto';
import { GrantCaseConsentDto } from './grant-case-consent.dto';
import { ListInteractionsQueryDto } from './list-interactions-query.dto';
import { RevokeCaseConsentDto } from './revoke-case-consent.dto';

describe('interaction DTO validation', () => {
  it('accepts a bounded interaction payload', async () => {
    const dto = plainToInstance(CreateInteractionDto, {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.PHONE,
      direction: InteractionDirection.INBOUND,
      summary: 'Solicitud recibida por telefono',
      occurredAt: '2026-08-31T12:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid enums, dates and oversized content', async () => {
    const dto = plainToInstance(CreateInteractionDto, {
      voterId: 'voter-a',
      channel: 'FAX',
      direction: 'EXTERNAL',
      summary: 'x'.repeat(5001),
      outcome: 'x'.repeat(1001),
      occurredAt: 'not-a-date',
    });

    const properties = (await validate(dto)).map(({ property }) => property);
    expect(properties).toEqual(
      expect.arrayContaining([
        'channel',
        'direction',
        'summary',
        'outcome',
        'occurredAt',
      ]),
    );
  });

  it('transforms and bounds pagination values', async () => {
    const valid = plainToInstance(ListInteractionsQueryDto, {
      issueCaseId: 'case-a',
      page: '2',
      limit: '100',
    });
    const invalid = plainToInstance(ListInteractionsQueryDto, {
      voterId: 'voter-a',
      page: '0',
      limit: '101',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.page).toBe(2);
    expect(valid.limit).toBe(100);
    const properties = (await validate(invalid)).map(
      ({ property }) => property,
    );
    expect(properties).toEqual(expect.arrayContaining(['page', 'limit']));
  });

  it('validates bounded case-consent capture and revocation DTOs', async () => {
    const grant = plainToInstance(GrantCaseConsentDto, {
      issueCaseId: 'case-a',
      collectionChannel: ConsentCollectionChannel.PHONE,
      noticeVersion: 'public-office-2026-09-v1',
      expiresAt: '2027-08-31T12:00:00.000Z',
    });
    const revoke = plainToInstance(RevokeCaseConsentDto, {
      issueCaseId: 'case-a',
      reason: 'Solicitud expresa del ciudadano',
    });

    await expect(validate(grant)).resolves.toHaveLength(0);
    await expect(validate(revoke)).resolves.toHaveLength(0);
  });

  it('rejects client-controlled legal basis and malformed consent evidence', async () => {
    const grant = plainToInstance(GrantCaseConsentDto, {
      issueCaseId: 'case-a',
      legalBasis: 'PUBLIC_TASK',
      collectionChannel: 'FAX',
      noticeVersion: 'version with spaces',
      grantedAt: 'not-a-date',
    });
    const properties = (
      await validate(grant, {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map(({ property }) => property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'legalBasis',
        'collectionChannel',
        'noticeVersion',
        'grantedAt',
      ]),
    );
  });
});
