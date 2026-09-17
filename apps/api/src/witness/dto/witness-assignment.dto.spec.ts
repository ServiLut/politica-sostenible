import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  WitnessAssignmentType,
  WitnessCaptureContext,
} from '../../../prisma/generated/prisma';
import {
  CancelWitnessAssignmentDto,
  CreateWitnessCoverageWindowDto,
  CreateWitnessAssignmentDto,
  ListWitnessAssignmentsQueryDto,
  ReassignWitnessAssignmentDto,
} from './witness-assignment.dto';

const COVERAGE_WINDOW_ID = `c${'1'.repeat(24)}`;
const WITNESS_ID = `c${'2'.repeat(24)}`;
const REPLACEMENT_WITNESS_ID = `c${'3'.repeat(24)}`;
const POLLING_PLACE_ID = `c${'4'.repeat(24)}`;

const validCreate = {
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  coverageWindowId: COVERAGE_WINDOW_ID,
  witnessId: WITNESS_ID,
  puestoId: POLLING_PLACE_ID,
  tableStart: 1,
  tableEnd: 12,
  shiftStartsAt: '2027-10-31T13:00:00.000Z',
  shiftEndsAt: '2027-10-31T21:00:00.000Z',
  captureContext: WitnessCaptureContext.REAL,
  assignmentType: WitnessAssignmentType.PRIMARY,
};

describe('witness assignment DTO validation', () => {
  it('accepts an exact, bounded table range and trims identifiers', async () => {
    const dto = plainToInstance(CreateWitnessAssignmentDto, {
      ...validCreate,
      witnessId: `  ${WITNESS_ID}  `,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.witnessId).toBe(WITNESS_ID);
  });

  it.each([
    ['legacy context', { captureContext: 'LEGACY_UNCLASSIFIED' }],
    ['non UUID idempotency key', { clientRequestId: 'request-1' }],
    ['zero table', { tableStart: 0 }],
    ['fractional table', { tableEnd: 2.5 }],
    ['invalid date', { shiftStartsAt: 'tomorrow' }],
    ['unknown type', { assignmentType: 'FLOATING' }],
    ['non CUID witness', { witnessId: 'witness-a' }],
  ])('rejects %s', async (_label, patch) => {
    const dto = plainToInstance(CreateWitnessAssignmentDto, {
      ...validCreate,
      ...patch,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires an optimistic version and a substantive cancellation reason', async () => {
    const invalid = plainToInstance(CancelWitnessAssignmentDto, {
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 0,
      reason: 'No puede',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('validates an explicit local date, IANA zone and UTC offset for a window', async () => {
    const dto = plainToInstance(CreateWitnessCoverageWindowDto, {
      clientRequestId: '44444444-4444-4444-8444-444444444444',
      puestoId: POLLING_PLACE_ID,
      captureContext: WitnessCaptureContext.REAL,
      localDate: '2027-10-31',
      startsAt: '2027-10-31T12:00:00.000Z',
      endsAt: '2027-10-31T22:00:00.000Z',
      timeZone: 'America/Bogota',
      utcOffsetMinutes: -300,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);

    const invalid = plainToInstance(CreateWitnessCoverageWindowDto, {
      ...dto,
      localDate: '31/10/2027',
      timeZone: 'Bogota',
      utcOffsetMinutes: -900,
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('validates the replacement payload and original version together', async () => {
    const replacement = plainToInstance(ReassignWitnessAssignmentDto, {
      ...validCreate,
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      witnessId: REPLACEMENT_WITNESS_ID,
      expectedVersion: 3,
      reason: 'Cambio documentado por indisponibilidad confirmada.',
    });
    await expect(validate(replacement)).resolves.toHaveLength(0);
  });

  it('coerces pagination but rejects unbounded page sizes', async () => {
    const valid = plainToInstance(ListWitnessAssignmentsQueryDto, {
      page: '2',
      limit: '100',
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({ page: 2, limit: 100 });

    const invalid = plainToInstance(ListWitnessAssignmentsQueryDto, {
      limit: '101',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
