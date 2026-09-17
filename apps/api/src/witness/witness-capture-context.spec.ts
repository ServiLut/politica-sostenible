import { ConflictException } from '@nestjs/common';
import {
  PoliticalOperationStage,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import { resolveWitnessCaptureContext } from './witness-capture-context';

function transactionWithStage(stage?: PoliticalOperationStage) {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(stage === undefined ? [] : [{ stage }]),
  };
}

describe('resolveWitnessCaptureContext', () => {
  it.each([
    [PoliticalOperationStage.SIMULATION, WitnessCaptureContext.SIMULATION],
    [PoliticalOperationStage.ELECTION_DAY, WitnessCaptureContext.REAL],
    [PoliticalOperationStage.POST_ELECTION, WitnessCaptureContext.REAL],
  ])(
    'derives write context from database stage %s',
    async (stage, expected) => {
      const transaction = transactionWithStage(stage);

      await expect(
        resolveWitnessCaptureContext(transaction, 'tenant-a', 'WRITE'),
      ).resolves.toBe(expected);
      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    },
  );

  it('allows archived real reads but never writes after closure', async () => {
    await expect(
      resolveWitnessCaptureContext(
        transactionWithStage(PoliticalOperationStage.CLOSED),
        'tenant-a',
        'READ',
      ),
    ).resolves.toBe(WitnessCaptureContext.REAL);

    await expect(
      resolveWitnessCaptureContext(
        transactionWithStage(PoliticalOperationStage.CLOSED),
        'tenant-a',
        'WRITE',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    [PoliticalOperationStage.SIMULATION, WitnessCaptureContext.SIMULATION],
    [PoliticalOperationStage.ELECTION_PREPARATION, WitnessCaptureContext.REAL],
  ])(
    'isolates polling-place configuration against the relevant %s context',
    async (stage, expected) => {
      await expect(
        resolveWitnessCaptureContext(
          transactionWithStage(stage),
          'tenant-a',
          'CONFIGURE',
        ),
      ).resolves.toBe(expected);
    },
  );

  it.each([
    PoliticalOperationStage.ELECTION_DAY,
    PoliticalOperationStage.POST_ELECTION,
    PoliticalOperationStage.CLOSED,
  ])('rejects polling-place reconfiguration during %s', async (stage) => {
    await expect(
      resolveWitnessCaptureContext(
        transactionWithStage(stage),
        'tenant-a',
        'CONFIGURE',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'E14_CAPTURE_STAGE_NOT_ALLOWED',
        currentStage: stage,
      }),
    });
  });

  it.each([
    PoliticalOperationStage.EXPLORATION,
    PoliticalOperationStage.PRE_CAMPAIGN,
    PoliticalOperationStage.SIGNATURE_COLLECTION,
    PoliticalOperationStage.CAMPAIGN,
    PoliticalOperationStage.ELECTION_PREPARATION,
  ])('rejects unsupported write stage %s', async (stage) => {
    await expect(
      resolveWitnessCaptureContext(
        transactionWithStage(stage),
        'tenant-a',
        'WRITE',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'E14_CAPTURE_STAGE_NOT_ALLOWED',
        currentStage: stage,
      }),
    });
  });

  it('fails closed when the tenant has no operation profile', async () => {
    await expect(
      resolveWitnessCaptureContext(transactionWithStage(), 'tenant-a', 'WRITE'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OPERATION_STAGE_NOT_CONFIGURED',
      }),
    });
  });
});
