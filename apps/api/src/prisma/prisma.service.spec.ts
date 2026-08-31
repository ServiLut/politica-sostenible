import { resolveDatabaseSchema } from './prisma.service';

describe('resolveDatabaseSchema', () => {
  it('reads the schema used by Prisma from DATABASE_URL', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com:5432/postgres?schema=politica-sostenible',
        undefined,
      ),
    ).toBe('politica-sostenible');
  });

  it('prefers an explicit DATABASE_SCHEMA', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres?schema=public',
        'campaign_data',
      ),
    ).toBe('campaign_data');
  });

  it('uses the adapter default when no schema is configured', () => {
    expect(
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres',
        undefined,
      ),
    ).toBeUndefined();
  });

  it('rejects malformed URLs and unsafe schema names', () => {
    expect(() => resolveDatabaseSchema('not-a-url', undefined)).toThrow(
      'DATABASE_URL must be a valid PostgreSQL URL',
    );
    expect(() =>
      resolveDatabaseSchema(
        'postgresql://user:password@db.example.com/postgres',
        'public; DROP SCHEMA public',
      ),
    ).toThrow('DATABASE_SCHEMA contains an invalid PostgreSQL identifier');
  });
});
