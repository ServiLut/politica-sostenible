import {
  ConflictException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliticalOperationStage } from '../../../prisma/generated/prisma';
import type { OperationStagePolicy } from '../decorators/operation-stage-policy.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationStageGuard } from './operation-stage.guard';

const ALLOWED_E14_STAGES = [
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

function executionContext(
  method = 'POST',
  user: { tenantId: string; userId: string } | null = {
    tenantId: 'tenant-a',
    userId: 'user-a',
  },
): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ method, user: user ?? undefined }),
    }),
  } as unknown as ExecutionContext;
}

function setup(
  policy: OperationStagePolicy | undefined,
  profile: { stage: PoliticalOperationStage } | null = null,
) {
  const getAllAndOverride = jest.fn().mockReturnValue(policy);
  const findUnique = jest.fn().mockResolvedValue(profile);
  const guard = new OperationStageGuard(
    { getAllAndOverride } as unknown as Reflector,
    {
      operationProfile: { findUnique },
    } as unknown as PrismaService,
  );
  return { findUnique, getAllAndOverride, guard };
}

describe('OperationStageGuard', () => {
  it('no consulta perfiles para rutas sin politica o excepciones legales', async () => {
    for (const policy of [undefined, { kind: 'ALLOW_CLOSED' } as const]) {
      const { guard, findUnique } = setup(policy, {
        stage: PoliticalOperationStage.CLOSED,
      });
      await expect(guard.canActivate(executionContext())).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    }
  });

  it('mantiene las lecturas disponibles incluso despues del cierre', async () => {
    const { guard, findUnique } = setup(
      { kind: 'BLOCK_CLOSED' },
      {
        stage: PoliticalOperationStage.CLOSED,
      },
    );

    await expect(guard.canActivate(executionContext('GET'))).resolves.toBe(
      true,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falla cerrado si una politica mutante no recibe identidad autenticada', async () => {
    const { guard, findUnique } = setup({ kind: 'BLOCK_CLOSED' });

    await expect(
      guard.canActivate(executionContext('PATCH', null)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('bloquea una mutacion CLOSED sin exponer tenant, actor o PII', async () => {
    const { guard, findUnique } = setup(
      { kind: 'BLOCK_CLOSED' },
      {
        stage: PoliticalOperationStage.CLOSED,
      },
    );

    let caught: unknown;
    try {
      await guard.canActivate(executionContext('DELETE'));
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    const response = (caught as ConflictException).getResponse();
    expect(response).toEqual({
      code: 'OPERATION_CLOSED',
      message:
        'La operacion esta cerrada y conserva sus registros operativos en modo de solo lectura',
      currentStage: PoliticalOperationStage.CLOSED,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /tenant-a|user-a|nombre|email/i,
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { stage: true },
    });
  });

  it('permite operar antes del cierre y no exige un perfil a gestion publica', async () => {
    const active = setup(
      { kind: 'BLOCK_CLOSED' },
      {
        stage: PoliticalOperationStage.CAMPAIGN,
      },
    );
    const withoutProfile = setup({ kind: 'BLOCK_CLOSED' }, null);

    await expect(active.guard.canActivate(executionContext())).resolves.toBe(
      true,
    );
    await expect(
      withoutProfile.guard.canActivate(executionContext()),
    ).resolves.toBe(true);
  });

  it.each(ALLOWED_E14_STAGES)(
    'habilita mutaciones E-14 durante %s',
    async (stage) => {
      const { guard } = setup(
        { kind: 'REQUIRE', allowedStages: ALLOWED_E14_STAGES },
        { stage },
      );
      await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    },
  );

  it.each([
    PoliticalOperationStage.EXPLORATION,
    PoliticalOperationStage.PRE_CAMPAIGN,
    PoliticalOperationStage.SIGNATURE_COLLECTION,
    PoliticalOperationStage.CAMPAIGN,
    PoliticalOperationStage.ELECTION_PREPARATION,
    PoliticalOperationStage.CLOSED,
  ])('rechaza mutaciones E-14 durante %s', async (stage) => {
    const { guard } = setup(
      { kind: 'REQUIRE', allowedStages: ALLOWED_E14_STAGES },
      { stage },
    );

    await expect(guard.canActivate(executionContext())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OPERATION_STAGE_NOT_ALLOWED',
        currentStage: stage,
        allowedStages: ALLOWED_E14_STAGES,
      }) as object,
    });
  });

  it('rechaza una etapa no incluida sin filtrar identidad', async () => {
    const { guard } = setup(
      { kind: 'REQUIRE', allowedStages: ALLOWED_E14_STAGES },
      { stage: PoliticalOperationStage.SIMULATION },
    );

    let caught: unknown;
    try {
      await guard.canActivate(executionContext());
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    const response = (caught as ConflictException).getResponse();
    expect(response).toEqual({
      code: 'OPERATION_STAGE_NOT_ALLOWED',
      message: 'La operacion electoral no esta habilitada durante SIMULATION',
      currentStage: PoliticalOperationStage.SIMULATION,
      allowedStages: ALLOWED_E14_STAGES,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /tenant-a|user-a|nombre|email/i,
    );
  });

  it('no permite E-14 sin una etapa vigente verificable', async () => {
    const { guard } = setup({
      kind: 'REQUIRE',
      allowedStages: ALLOWED_E14_STAGES,
    });

    await expect(guard.canActivate(executionContext())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'OPERATION_STAGE_NOT_CONFIGURED',
        currentStage: null,
      }) as object,
    });
  });
});
