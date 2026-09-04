import {
  createSessionVersion,
  isCurrentSessionVersion,
} from './session-version';

describe('password-bound session version', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
  });

  it('creates only an opaque deterministic HMAC and validates it', () => {
    const version = createSessionVersion('user-a', 'bcrypt-password-hash');

    expect(version).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(version).not.toContain('user-a');
    expect(version).not.toContain('bcrypt-password-hash');
    expect(
      isCurrentSessionVersion(version, 'user-a', 'bcrypt-password-hash'),
    ).toBe(true);
  });

  it.each([undefined, 'legacy-token'])(
    'rejects a missing or malformed claim',
    (claim) => {
      expect(
        isCurrentSessionVersion(claim, 'user-a', 'bcrypt-password-hash'),
      ).toBe(false);
    },
  );

  it('rejects a claim after the password hash changes', () => {
    const stale = createSessionVersion('user-a', 'old-password-hash');

    expect(
      isCurrentSessionVersion(stale, 'user-a', 'new-password-hash'),
    ).toBe(false);
  });
});
