import { Reflector } from '@nestjs/core';
import { Role } from '../../prisma/generated/prisma';
import { OPERATION_STAGE_POLICY_KEY } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FinanceCloseoutController } from './finance-closeout.controller';
import { FinanceCloseoutService } from './finance-closeout.service';

const user: AuthenticatedUser = {
  tenantId: 'tenant-from-jwt',
  userId: 'actor-from-jwt',
  role: Role.FINANCE_MANAGER,
};

describe('FinanceCloseoutController', () => {
  it('forwards only the authenticated identity to overview and mutations', async () => {
    const overview = jest.fn().mockResolvedValue({ readiness: {} });
    const createDossier = jest.fn().mockResolvedValue({ id: 'dossier-a' });
    const service = {
      overview,
      createDossier,
    } as unknown as FinanceCloseoutService;
    const controller = new FinanceCloseoutController(service);
    const dto = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      payloadSha256: 'a'.repeat(64),
      kind: 'CANDIDATE' as const,
      subjectCode: 'CAND-1',
      subjectName: 'Candidatura uno',
    };

    await controller.overview(user);
    await controller.createDossier(user, dto);

    expect(overview).toHaveBeenCalledWith(user);
    expect(createDossier).toHaveBeenCalledWith(user, dto);
    expect(createDossier).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.anything() }),
      expect.objectContaining({ tenantId: expect.anything() }),
    );
  });

  it('keeps GET readable after CLOSED and overrides every mutation to block', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(OPERATION_STAGE_POLICY_KEY, FinanceCloseoutController),
    ).toEqual({ kind: 'ALLOW_CLOSED' });
    for (const method of [
      'createDossier',
      'createBankStatement',
      'createInKind',
      'createPayable',
      'settlePayable',
      'createVersion',
      'approveVersion',
      'recordExternalEvidence',
      'reviewExternalEvidence',
    ] as const) {
      expect(
        reflector.get(
          OPERATION_STAGE_POLICY_KEY,
          FinanceCloseoutController.prototype[method],
        ),
      ).toEqual({ kind: 'BLOCK_CLOSED' });
    }
    expect(
      reflector.get(
        OPERATION_STAGE_POLICY_KEY,
        FinanceCloseoutController.prototype.overview,
      ),
    ).toBeUndefined();
  });
});
