import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  E14FormType,
  WitnessCredentialType,
} from '../../../prisma/generated/prisma';
import { SyncE14Dto } from './sync-e14.dto';

const validInput = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-09-01T12:00:00.000Z',
  captureGrant: 'A'.repeat(43),
  evidenceSha256: 'a'.repeat(64),
  puestoId: 'puesto-a',
  mesa: 1,
  e14ImageUrl: 'tenant-a/e14/11111111-1111-4111-8111-111111111111.pdf',
  credentialType: WitnessCredentialType.E15,
  credentialReference: 'E15-001',
  checkedInAt: '2026-09-01T11:55:00.000Z',
  e14FormType: E14FormType.DELEGADOS,
  candidateVotes: 10,
  blankVotes: 1,
  nullVotes: 0,
  unmarkedVotes: 0,
  totalTableVotes: 20,
  hasWrittenClaim: false,
};

describe('SyncE14Dto offline metadata', () => {
  it('accepts a complete strict offline envelope', async () => {
    await expect(
      validate(plainToInstance(SyncE14Dto, validInput)),
    ).resolves.toHaveLength(0);
  });

  it.each([
    ['clientOperationId', { clientOperationId: undefined }],
    ['clientOperationId', { clientOperationId: 'operation-1' }],
    ['capturedAt', { capturedAt: undefined }],
    ['capturedAt', { capturedAt: 'yesterday' }],
    ['capturedAt', { capturedAt: '2026-09-01' }],
    ['captureGrant', { captureGrant: 'not-a-grant' }],
    ['evidenceSha256', { evidenceSha256: 'A'.repeat(64) }],
  ])('rejects an invalid %s', async (property, override) => {
    const errors = await validate(
      plainToInstance(SyncE14Dto, { ...validInput, ...override }),
    );

    expect(errors.map((error) => error.property)).toContain(property);
  });

  it.each(['tenantId', 'captureContext', 'captureIp', 'uploadToken'])(
    'rejects client-controlled field %s with the production whitelist policy',
    async (property) => {
      const errors = await validate(
        plainToInstance(SyncE14Dto, {
          ...validInput,
          [property]: 'client-controlled',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      );

      expect(errors.map((error) => error.property)).toContain(property);
    },
  );
});
