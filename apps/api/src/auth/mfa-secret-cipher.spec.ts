import { createHash, randomBytes } from 'node:crypto';
import {
  loadMfaSecretCipherConfig,
  MfaSecretCipher,
  MfaSecretConfigurationError,
  MfaSecretDecryptionError,
} from './mfa-secret-cipher';

function key(seed: number): Buffer {
  return Buffer.alloc(32, seed);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function context() {
  return { tenantId: 'tenant-a', userId: 'user-a' };
}

function cipher(
  activeKeyId = 'key-current',
  activeKey = key(1),
  legacyPlaintextMode: 'migrate' | 'reject' = 'reject',
  previousKeys?: ReadonlyMap<string, Buffer>,
) {
  return new MfaSecretCipher({
    activeKeyId,
    activeKey,
    previousKeys,
    legacyPlaintextMode,
  });
}

describe('MfaSecretCipher', () => {
  it('cifra con AES-GCM autenticado y vincula el secreto al tenant y usuario', () => {
    const plaintext = randomBytes(24).toString('base64url');
    const service = cipher();

    const encrypted = service.encrypt(plaintext, context());
    const decrypted = service.decrypt(encrypted, context());

    expect(encrypted).toMatch(/^totp:v1:key-current:/u);
    expect(encrypted.includes(plaintext)).toBe(false);
    expect(digest(decrypted.secret)).toBe(digest(plaintext));
    expect(decrypted).toMatchObject({
      requiresReencryption: false,
      source: 'encrypted',
    });
    expect(() =>
      service.decrypt(encrypted, {
        tenantId: 'tenant-b',
        userId: 'user-a',
      }),
    ).toThrow(MfaSecretDecryptionError);
  });

  it('rechaza un sobre alterado sin revelar su contenido', () => {
    const service = cipher();
    const encrypted = service.encrypt(
      randomBytes(24).toString('base64url'),
      context(),
    );
    const lastCharacter = encrypted.at(-1);
    const tampered = `${encrypted.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`;

    expect(() => service.decrypt(tampered, context())).toThrow(
      MfaSecretDecryptionError,
    );
  });

  it.each([
    ['versión desconocida', (parts: string[]) => (parts[1] = 'v2')],
    ['clave desconocida', (parts: string[]) => (parts[2] = 'key-missing')],
    ['IV no canónico', (parts: string[]) => (parts[3] = `${parts[3]}=`)],
    ['tag vacío', (parts: string[]) => (parts[5] = '')],
    ['segmento adicional', (parts: string[]) => parts.push('unexpected')],
  ])('rechaza un sobre con %s', (_scenario, mutate) => {
    const service = cipher();
    const encrypted = service.encrypt(
      randomBytes(24).toString('base64url'),
      context(),
    );
    const parts = encrypted.split(':');
    mutate(parts);

    expect(() => service.decrypt(parts.join(':'), context())).toThrow(
      MfaSecretDecryptionError,
    );
  });

  it('descifra una clave anterior y marca el secreto para rotación perezosa', () => {
    const oldKey = key(2);
    const newKey = key(3);
    const plaintext = randomBytes(24).toString('base64url');
    const oldCipher = cipher('key-old', oldKey);
    const encryptedWithOldKey = oldCipher.encrypt(plaintext, context());
    const rotatingCipher = cipher(
      'key-current',
      newKey,
      'reject',
      new Map([['key-old', oldKey]]),
    );

    const decrypted = rotatingCipher.decrypt(encryptedWithOldKey, context());
    const reencrypted = rotatingCipher.encrypt(decrypted.secret, context());

    expect(decrypted.requiresReencryption).toBe(true);
    expect(decrypted.sourceKeyId).toBe('key-old');
    expect(digest(decrypted.secret)).toBe(digest(plaintext));
    expect(reencrypted).toMatch(/^totp:v1:key-current:/u);
    expect(
      rotatingCipher.decrypt(reencrypted, context()).requiresReencryption,
    ).toBe(false);
  });

  it('migra texto plano solo cuando el operador lo habilita explícitamente', () => {
    const plaintext = randomBytes(24).toString('base64url');
    const migrationCipher = cipher('key-current', key(1), 'migrate');

    expect(migrationCipher.decrypt(plaintext, context())).toMatchObject({
      requiresReencryption: true,
      source: 'legacy-plaintext',
    });
    expect(() => cipher().decrypt(plaintext, context())).toThrow(
      MfaSecretDecryptionError,
    );
  });

  it('valida la clave activa, modo heredado y llavero de rotación', () => {
    const validEnvironment = {
      MFA_TOTP_ACTIVE_KEY_ID: 'key-2026-09',
      MFA_TOTP_ENCRYPTION_KEY: key(4).toString('base64'),
      MFA_TOTP_LEGACY_PLAINTEXT_MODE: 'migrate',
      MFA_TOTP_PREVIOUS_KEYS: JSON.stringify({
        'key-2026-08': key(5).toString('base64'),
      }),
    };

    expect(loadMfaSecretCipherConfig(validEnvironment)).toMatchObject({
      activeKeyId: 'key-2026-09',
      legacyPlaintextMode: 'migrate',
    });
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow(MfaSecretConfigurationError);
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_LEGACY_PLAINTEXT_MODE: 'automatic',
      }),
    ).toThrow(MfaSecretConfigurationError);
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_PREVIOUS_KEYS: '{not-json}',
      }),
    ).toThrow(MfaSecretConfigurationError);
    expect(() => loadMfaSecretCipherConfig({})).toThrow(
      MfaSecretConfigurationError,
    );
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_ACTIVE_KEY_ID: 'identificador inválido',
      }),
    ).toThrow(MfaSecretConfigurationError);
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_PREVIOUS_KEYS: JSON.stringify({
          'key-2026-09': key(5).toString('base64'),
        }),
      }),
    ).toThrow(MfaSecretConfigurationError);
    expect(() =>
      loadMfaSecretCipherConfig({
        ...validEnvironment,
        MFA_TOTP_PREVIOUS_KEYS: JSON.stringify([key(5).toString('base64')]),
      }),
    ).toThrow(MfaSecretConfigurationError);
  });

  it('valida también la configuración programática y secretos vacíos', () => {
    expect(() => cipher().encrypt('', context())).toThrow(
      MfaSecretDecryptionError,
    );
    expect(
      () =>
        new MfaSecretCipher({
          activeKeyId: 'key-current',
          activeKey: key(1).subarray(0, 16),
          legacyPlaintextMode: 'reject',
        }),
    ).toThrow(MfaSecretConfigurationError);
    expect(
      () =>
        new MfaSecretCipher({
          activeKeyId: 'key-current',
          activeKey: key(1),
          previousKeys: new Map([['key-current', key(2)]]),
          legacyPlaintextMode: 'reject',
        }),
    ).toThrow(MfaSecretConfigurationError);
    expect(
      () =>
        new MfaSecretCipher({
          activeKeyId: 'key-current',
          activeKey: key(1),
          previousKeys: new Map([['key-old', key(2).subarray(0, 16)]]),
          legacyPlaintextMode: 'reject',
        }),
    ).toThrow(MfaSecretConfigurationError);
  });
});
