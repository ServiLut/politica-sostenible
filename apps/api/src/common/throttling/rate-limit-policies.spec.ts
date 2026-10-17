import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { AuthController } from '../../auth/auth.controller';
import { ImportController } from '../../import/import.controller';
import { ExportController } from '../../export/export.controller';
import { PersonImportController } from '../../import/person-import.controller';
import { createLoginIdentityThrottler } from './login-identity-rate-limit';
import { OPERATION_RATE_LIMIT_KEY } from './operation-rate-limit';

jest.mock('../../auth/auth.service', () => ({ AuthService: class {} }));
jest.mock('../../auth/mfa.service', () => ({ MfaService: class {} }));
jest.mock('../../import/import.service', () => ({ ImportService: class {} }));
jest.mock('../../import/person-import.service', () => ({
  PersonImportService: class {},
}));
jest.mock('../../export/export.service', () => ({ ExportService: class {} }));

function loginContext(
  body: unknown,
  ip: string,
  handler: object = AuthController.prototype.login,
) {
  const header = jest.fn();
  return {
    header,
    value: {
      getHandler: () => handler,
      getClass: () => AuthController,
      switchToHttp: () => ({
        getRequest: () => ({ body, ip, headers: {} }),
        getResponse: () => ({ header }),
      }),
    } as unknown as ExecutionContext,
  };
}

describe('rate limit policies', () => {
  const storage = new ThrottlerStorageService();
  const identityPolicy = createLoginIdentityThrottler(
    'local-test-key-not-a-production-credential',
  );
  const guard = new ThrottlerGuard(
    {
      throttlers: [
        { name: 'default', limit: 120, ttl: 60_000, blockDuration: 60_000 },
        identityPolicy,
      ],
    },
    storage,
    new Reflector(),
  );

  beforeAll(() => guard.onModuleInit());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => storage.onApplicationShutdown());

  it('blocks the same login identity across IPs and normalized spelling without exposing it in storage keys', async () => {
    const increment = jest.spyOn(storage, 'increment');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const email = attempt % 2 ? ' TEAM@example.test ' : 'team@example.test';
      await expect(
        guard.canActivate(
          loginContext({ email }, `192.0.2.${attempt + 1}`).value,
        ),
      ).resolves.toBe(true);
    }
    const blocked = loginContext(
      { email: `${' '.repeat(600)}TEAM@example.test ` },
      '198.51.100.1',
    );
    await expect(guard.canActivate(blocked.value)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(blocked.header).toHaveBeenCalledWith(
      'Retry-After-login-identity',
      expect.any(Number),
    );
    expect(JSON.stringify(increment.mock.calls)).not.toMatch(
      /team|example|TEAM/,
    );
    await expect(
      guard.canActivate(
        loginContext({ email: 'other@example.test' }, '198.51.100.2').value,
      ),
    ).resolves.toBe(true);
  });

  it('retains the existing IP limit even when each attempt names another account', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        guard.canActivate(
          loginContext(
            { email: `ip-test-${attempt}@example.test` },
            '203.0.113.1',
          ).value,
        ),
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(
        loginContext({ email: 'ip-test-9@example.test' }, '203.0.113.1').value,
      ),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { email: null },
    { email: ['team@example.test'] },
    { email: 1 },
    { email: {} },
    { email: 'invalid' },
    { email: `${'a'.repeat(255)}@example.test` },
  ])(
    'does not crash or allocate an identity bucket for malformed input %p',
    (body) => {
      expect(
        identityPolicy.skipIf!(loginContext(body, '192.0.2.1').value),
      ).toBe(true);
    },
  );

  it('does not apply the login identity limiter to another public handler', () => {
    expect(
      identityPolicy.skipIf!(
        loginContext(
          { email: 'team@example.test' },
          '192.0.2.1',
          AuthController.prototype.register,
        ).value,
      ),
    ).toBe(true);
  });

  it('uses a keyed digest with a server secret rather than an enumerable email hash', async () => {
    const otherPolicy = createLoginIdentityThrottler('another-local-test-key');
    const request = { body: { email: 'team@example.test' } };
    const context = loginContext(request.body, '192.0.2.1').value;
    const tracker = await identityPolicy.getTracker!(request, context);
    expect(tracker).toMatch(/^[a-f0-9]{64}$/);
    expect(tracker).not.toBe(await otherPolicy.getTracker!(request, context));
    expect(() => createLoginIdentityThrottler('')).toThrow('server secret');
  });

  it('attaches expensive-operation policies to the actual import and export handlers', () => {
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        ImportController.prototype.preview,
      ),
    ).toBe('import-preview');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        ImportController.prototype.execute,
      ),
    ).toBe('import-execute');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        ExportController.prototype.exportModule,
      ),
    ).toBe('export');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        ImportController.prototype.downloadTemplate,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        PersonImportController.prototype.create,
      ),
    ).toBe('import-preview');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        PersonImportController.prototype.execute,
      ),
    ).toBe('import-execute');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        PersonImportController.prototype.retry,
      ),
    ).toBe('import-execute');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        PersonImportController.prototype.errorCsv,
      ),
    ).toBe('export');
    expect(
      Reflect.getMetadata(
        OPERATION_RATE_LIMIT_KEY,
        PersonImportController.prototype.get,
      ),
    ).toBeUndefined();
  });
});
