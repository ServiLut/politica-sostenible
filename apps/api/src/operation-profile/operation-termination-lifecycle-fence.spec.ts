import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('operation lifecycle transaction fence', () => {
  const terminationService = readFileSync(
    resolve('src/operation-profile/operation-termination.service.ts'),
    'utf8',
  );
  const profileService = readFileSync(
    resolve('src/operation-profile/operation-profile.service.ts'),
    'utf8',
  );
  const stageGuard = readFileSync(
    resolve('src/auth/guards/operation-stage.guard.ts'),
    'utf8',
  );
  const riskRecord = readFileSync(
    resolve('../../docs/CIERRE_EXCEPCIONAL_FENCE_TRANSACCIONAL.md'),
    'utf8',
  );

  it('serializes exceptional lifecycle actions and ordinary profile updates on the same tenant key', () => {
    const lockExpression = 'operation-profile-lifecycle:${tenantId}';

    expect(terminationService).toContain(lockExpression);
    expect(profileService).toContain(lockExpression);
    expect(terminationService).toContain('FOR UPDATE');
    expect(profileService).toContain('FOR UPDATE');
    expect(terminationService).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
    expect(profileService).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
  });

  it('keeps the non-E14 in-flight mutation TOCTOU limitation explicit and actionable', () => {
    expect(stageGuard).toContain('not a linearizable database fence');
    expect(stageGuard).toContain('close-vs-mutation TOCTOU window');
    expect(riskRecord).toContain(
      'Una mutacion de otro dominio puede superar el guard',
    );
    expect(riskRecord).toContain('pg_advisory_xact_lock');
    expect(riskRecord).toContain('FOR UPDATE');
    expect(riskRecord).toContain('closureEpoch');
    expect(riskRecord).not.toMatch(/riesgo (resuelto|eliminado)/iu);
  });
});
