import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentCollectionChannel } from '../../../prisma/generated/prisma';
import { SyncVoterDto } from './sync-voter.dto';

const validInput = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-09-01T12:00:00.000Z',
  documentId: '1012345678',
  firstName: 'Ana',
  lastName: 'Rojas',
  consentAccepted: true,
  termsVersion: '2026.1',
  collectionChannel: ConsentCollectionChannel.IN_PERSON,
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

  it.each([
    ['clientOperationId', { clientOperationId: undefined }],
    ['clientOperationId', { clientOperationId: 'not-a-uuid' }],
    ['capturedAt', { capturedAt: undefined }],
    ['capturedAt', { capturedAt: '09/01/2026' }],
    ['capturedAt', { capturedAt: '2026-09-01' }],
    ['mesa', { mesa: 0 }],
    ['mesa', { mesa: 100_000 }],
  ])('rejects invalid offline metadata for %s', async (property, override) => {
    const errors = await validate(
      plainToInstance(SyncVoterDto, { ...validInput, ...override }),
    );

    expect(errors.map((error) => error.property)).toContain(property);
  });

  it('accepts and normalizes a polling table number', async () => {
    const dto = plainToInstance(SyncVoterDto, {
      ...validInput,
      puestoId: 'puesto-a',
      mesa: '42',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.mesa).toBe(42);
  });
});
