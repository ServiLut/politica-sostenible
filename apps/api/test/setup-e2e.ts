process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
process.env.MFA_TOTP_ACTIVE_KEY_ID = 'e2e-current';
process.env.MFA_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
process.env.MFA_TOTP_LEGACY_PLAINTEXT_MODE = 'reject';
process.env.MFA_TOTP_PREVIOUS_KEYS = '';
process.env.SAAS_ADMIN_USER_IDS = '00000000-0000-4000-8000-000000000001';
delete process.env.SAAS_ADMIN_EMAILS;
process.env.CONSENT_IP_SALT = 'test-only-consent-ip-salt';
process.env.OFFLINE_SYNC_HMAC_SECRET =
  'test-only-offline-sync-hmac-secret-at-least-32-bytes';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test-only';
process.env.SUPABASE_STORAGE_BUCKET = 'test-private-files';

// An absent DATABASE_URL deliberately keeps this HTTP wiring test isolated
// from every developer or production database.
delete process.env.DATABASE_URL;
