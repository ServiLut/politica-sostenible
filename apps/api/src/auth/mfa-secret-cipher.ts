import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_NAMESPACE = 'totp';
const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,32}$/u;
const MAX_PREVIOUS_KEYS = 8;

export type MfaLegacyPlaintextMode = 'migrate' | 'reject';

export interface MfaSecretContext {
  tenantId: string;
  userId: string;
}

export interface MfaSecretCipherConfig {
  activeKeyId: string;
  activeKey: Buffer;
  previousKeys?: ReadonlyMap<string, Buffer>;
  legacyPlaintextMode: MfaLegacyPlaintextMode;
}

export interface DecryptedMfaSecret {
  secret: string;
  requiresReencryption: boolean;
  source: 'encrypted' | 'legacy-plaintext';
  sourceKeyId?: string;
}

export class MfaSecretConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaSecretConfigurationError';
  }
}

export class MfaSecretDecryptionError extends Error {
  constructor() {
    super('El secreto MFA almacenado no se puede descifrar de forma segura.');
    this.name = 'MfaSecretDecryptionError';
  }
}

function decodeEncryptionKey(value: string, variableName: string): Buffer {
  const normalized = value.trim();
  const decoded = Buffer.from(normalized, 'base64');
  if (
    decoded.length !== KEY_BYTES ||
    decoded.toString('base64') !== normalized
  ) {
    throw new MfaSecretConfigurationError(
      `${variableName} debe ser una clave de 32 bytes codificada en base64 canónico.`,
    );
  }
  return decoded;
}

function validateKeyId(value: string, variableName: string): string {
  const normalized = value.trim();
  if (!KEY_ID_PATTERN.test(normalized)) {
    throw new MfaSecretConfigurationError(
      `${variableName} debe tener entre 1 y 32 caracteres alfanuméricos, punto, guion o guion bajo.`,
    );
  }
  return normalized;
}

function parsePreviousKeys(
  serializedKeys: string | undefined,
  activeKeyId: string,
): ReadonlyMap<string, Buffer> {
  if (!serializedKeys?.trim()) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new MfaSecretConfigurationError(
      'MFA_TOTP_PREVIOUS_KEYS debe ser un objeto JSON válido.',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MfaSecretConfigurationError(
      'MFA_TOTP_PREVIOUS_KEYS debe ser un objeto JSON de identificadores y claves.',
    );
  }

  const entries = Object.entries(parsed);
  if (entries.length > MAX_PREVIOUS_KEYS) {
    throw new MfaSecretConfigurationError(
      `MFA_TOTP_PREVIOUS_KEYS no puede contener más de ${MAX_PREVIOUS_KEYS} claves.`,
    );
  }

  const keys = new Map<string, Buffer>();
  for (const [rawKeyId, rawKey] of entries) {
    const keyId = validateKeyId(rawKeyId, 'MFA_TOTP_PREVIOUS_KEYS');
    if (keyId === activeKeyId) {
      throw new MfaSecretConfigurationError(
        'MFA_TOTP_PREVIOUS_KEYS no debe repetir la clave activa.',
      );
    }
    if (typeof rawKey !== 'string') {
      throw new MfaSecretConfigurationError(
        'Cada valor de MFA_TOTP_PREVIOUS_KEYS debe ser una clave base64.',
      );
    }
    keys.set(
      keyId,
      decodeEncryptionKey(rawKey, `MFA_TOTP_PREVIOUS_KEYS.${keyId}`),
    );
  }

  return keys;
}

export function loadMfaSecretCipherConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MfaSecretCipherConfig {
  const activeKeyIdValue = environment.MFA_TOTP_ACTIVE_KEY_ID;
  const activeKeyValue = environment.MFA_TOTP_ENCRYPTION_KEY;
  const legacyPlaintextMode = environment.MFA_TOTP_LEGACY_PLAINTEXT_MODE;

  if (!activeKeyIdValue?.trim()) {
    throw new MfaSecretConfigurationError(
      'MFA_TOTP_ACTIVE_KEY_ID es obligatorio.',
    );
  }
  if (!activeKeyValue?.trim()) {
    throw new MfaSecretConfigurationError(
      'MFA_TOTP_ENCRYPTION_KEY es obligatoria.',
    );
  }
  if (legacyPlaintextMode !== 'migrate' && legacyPlaintextMode !== 'reject') {
    throw new MfaSecretConfigurationError(
      'MFA_TOTP_LEGACY_PLAINTEXT_MODE debe ser migrate o reject.',
    );
  }

  const activeKeyId = validateKeyId(activeKeyIdValue, 'MFA_TOTP_ACTIVE_KEY_ID');
  return {
    activeKeyId,
    activeKey: decodeEncryptionKey(activeKeyValue, 'MFA_TOTP_ENCRYPTION_KEY'),
    previousKeys: parsePreviousKeys(
      environment.MFA_TOTP_PREVIOUS_KEYS,
      activeKeyId,
    ),
    legacyPlaintextMode,
  };
}

function authenticatedContext(
  version: string,
  keyId: string,
  context: MfaSecretContext,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      ENVELOPE_NAMESPACE,
      version,
      keyId,
      context.tenantId,
      context.userId,
    ]),
    'utf8',
  );
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new MfaSecretDecryptionError();
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new MfaSecretDecryptionError();
  }
  return decoded;
}

export class MfaSecretCipher {
  private readonly activeKey: Buffer;
  private readonly decryptionKeys: ReadonlyMap<string, Buffer>;

  constructor(private readonly config: MfaSecretCipherConfig) {
    const activeKeyId = validateKeyId(config.activeKeyId, 'activeKeyId');
    if (config.activeKey.length !== KEY_BYTES) {
      throw new MfaSecretConfigurationError(
        `La clave MFA activa debe contener ${KEY_BYTES} bytes.`,
      );
    }
    if (
      config.legacyPlaintextMode !== 'migrate' &&
      config.legacyPlaintextMode !== 'reject'
    ) {
      throw new MfaSecretConfigurationError(
        'El modo de secretos MFA heredados debe ser migrate o reject.',
      );
    }

    const previousEntries = [...(config.previousKeys?.entries() ?? [])];
    if (previousEntries.length > MAX_PREVIOUS_KEYS) {
      throw new MfaSecretConfigurationError(
        `No se pueden configurar más de ${MAX_PREVIOUS_KEYS} claves MFA anteriores.`,
      );
    }
    const normalizedPreviousKeys = previousEntries.map(([rawKeyId, key]) => {
      const keyId = validateKeyId(rawKeyId, 'previousKeys');
      if (keyId === activeKeyId) {
        throw new MfaSecretConfigurationError(
          'Las claves MFA anteriores no deben repetir la clave activa.',
        );
      }
      if (key.length !== KEY_BYTES) {
        throw new MfaSecretConfigurationError(
          `La clave MFA anterior ${keyId} debe contener ${KEY_BYTES} bytes.`,
        );
      }
      return [keyId, Buffer.from(key)] as const;
    });

    this.config = { ...config, activeKeyId };
    this.activeKey = Buffer.from(config.activeKey);
    this.decryptionKeys = new Map([
      [activeKeyId, this.activeKey],
      ...normalizedPreviousKeys,
    ]);
  }

  encrypt(secret: string, context: MfaSecretContext): string {
    if (!secret) {
      throw new MfaSecretDecryptionError();
    }

    const iv = randomBytes(IV_BYTES);
    const plaintext = Buffer.from(secret, 'utf8');
    try {
      const cipher = createCipheriv(ALGORITHM, this.activeKey, iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(
        authenticatedContext(
          ENVELOPE_VERSION,
          this.config.activeKeyId,
          context,
        ),
      );
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        ENVELOPE_NAMESPACE,
        ENVELOPE_VERSION,
        this.config.activeKeyId,
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        authTag.toString('base64url'),
      ].join(':');
    } finally {
      plaintext.fill(0);
    }
  }

  decrypt(storedSecret: string, context: MfaSecretContext): DecryptedMfaSecret {
    if (!storedSecret.startsWith(`${ENVELOPE_NAMESPACE}:`)) {
      if (this.config.legacyPlaintextMode === 'reject') {
        throw new MfaSecretDecryptionError();
      }
      return {
        secret: storedSecret,
        requiresReencryption: true,
        source: 'legacy-plaintext',
      };
    }

    const [
      namespace,
      version,
      keyId,
      encodedIv,
      encodedCiphertext,
      encodedTag,
    ] = storedSecret.split(':');
    if (
      namespace !== ENVELOPE_NAMESPACE ||
      version !== ENVELOPE_VERSION ||
      !keyId ||
      !encodedIv ||
      !encodedCiphertext ||
      !encodedTag ||
      storedSecret.split(':').length !== 6
    ) {
      throw new MfaSecretDecryptionError();
    }

    const key = this.decryptionKeys.get(keyId);
    if (!key) throw new MfaSecretDecryptionError();

    const iv = decodeBase64Url(encodedIv);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    const authTag = decodeBase64Url(encodedTag);
    if (
      iv.length !== IV_BYTES ||
      authTag.length !== AUTH_TAG_BYTES ||
      ciphertext.length === 0
    ) {
      throw new MfaSecretDecryptionError();
    }

    let plaintext: Buffer | undefined;
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(authenticatedContext(version, keyId, context));
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      const secret = plaintext.toString('utf8');
      if (!secret) throw new MfaSecretDecryptionError();

      return {
        secret,
        requiresReencryption: keyId !== this.config.activeKeyId,
        source: 'encrypted',
        sourceKeyId: keyId,
      };
    } catch (error: unknown) {
      if (error instanceof MfaSecretDecryptionError) throw error;
      throw new MfaSecretDecryptionError();
    } finally {
      plaintext?.fill(0);
    }
  }
}
