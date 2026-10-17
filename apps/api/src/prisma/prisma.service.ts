import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  checkServerIdentity,
  type ConnectionOptions,
  type PeerCertificate,
} from 'node:tls';
import {
  assertRuntimeDatabaseRole,
  runtimeDatabaseRoleGuardRequired,
  runtimeDatabaseRoleQuery,
  type RuntimeDatabaseRoleState,
} from './runtime-database-role';

const POSTGRES_IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_-]{0,62}$/u;

export function resolveDatabaseSchema(
  connectionString: string | undefined,
  configuredSchema = process.env.DATABASE_SCHEMA,
): string | undefined {
  const explicitSchema = configuredSchema?.trim();
  let urlSchema: string | undefined;

  if (connectionString) {
    try {
      urlSchema = new URL(connectionString).searchParams.get('schema')?.trim();
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
  }

  const schema = explicitSchema || urlSchema;
  if (!schema) return undefined;

  if (!POSTGRES_IDENTIFIER.test(schema)) {
    throw new Error(
      'DATABASE_SCHEMA contains an invalid PostgreSQL identifier',
    );
  }

  return schema;
}

export function resolveDatabaseSearchPathOptions(
  schema: string | undefined,
): string | undefined {
  if (!schema) return undefined;
  if (!POSTGRES_IDENTIFIER.test(schema)) {
    throw new Error(
      'DATABASE_SCHEMA contains an invalid PostgreSQL identifier',
    );
  }
  // Prisma qualifies generated statements with the adapter schema, while raw
  // SQL and trigger bodies use PostgreSQL's session search_path. Pin both to
  // the same validated schema and keep pg_catalog explicit.
  return `-c search_path="${schema}",pg_catalog`;
}

export function resolveDatabaseSsl(
  environment: NodeJS.ProcessEnv = process.env,
): false | ConnectionOptions {
  const sslEnabled = environment.DATABASE_SSL === 'true';
  const rejectUnauthorized =
    environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  const production = environment.NODE_ENV === 'production';
  const insecureEvaluation =
    production &&
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() === 'evaluation' &&
    environment.ALLOW_INSECURE_DATABASE_CONNECTION === 'true';

  if (production && !insecureEvaluation) {
    if (!sslEnabled || !rejectUnauthorized) {
      throw new Error(
        'PostgreSQL TLS is mandatory outside the explicit evaluation profile',
      );
    }
  }

  if (insecureEvaluation) {
    if (sslEnabled || rejectUnauthorized) {
      throw new Error(
        'The evaluation database exception requires DATABASE_SSL=false and DATABASE_SSL_REJECT_UNAUTHORIZED=false',
      );
    }
    console.warn(
      'PostgreSQL is using the explicit insecure evaluation profile; do not use it with real data.',
    );
    return false;
  }

  if (!sslEnabled) return false;
  const connectionString = environment.DATABASE_URL;
  const hostname = connectionString
    ? new URL(connectionString).hostname.replace(/^\[|\]$/gu, '')
    : undefined;
  return {
    rejectUnauthorized,
    ...(hostname
      ? {
          // pg supplies no SNI for IP hosts. Verify the configured identity,
          // including IP SANs, instead of tls.connect's localhost fallback.
          checkServerIdentity: (_hostname: string, certificate: PeerCertificate) =>
            checkServerIdentity(hostname, certificate),
        }
      : {}),
  };
}

export function resolveDatabaseConnectionString(
  connectionString: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!connectionString) return undefined;
  const evaluation =
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() === 'evaluation' &&
    environment.ALLOW_INSECURE_DATABASE_CONNECTION === 'true';
  if (environment.NODE_ENV !== 'production' || evaluation)
    return connectionString;
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  const tlsParameters = [...parsed.searchParams].filter(
    ([key]) =>
      key.toLowerCase().startsWith('ssl') ||
      key.toLowerCase() === 'uselibpqcompat',
  );
  if (
    tlsParameters.length > 1 ||
    tlsParameters.some(
      ([key, value]) => key !== 'sslmode' || value !== 'verify-full',
    )
  ) {
    throw new Error('DATABASE_URL cannot override verified PostgreSQL TLS');
  }
  // pg connection-string options override the explicit ssl object. Remove the
  // sole permitted mode so rejectUnauthorized:true remains effective in pg.
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL is required in production');
      }

      console.warn('DATABASE_URL is not configured. Database calls will fail.');
    }

    const schema = resolveDatabaseSchema(connectionString);
    const pool = new pg.Pool({
      connectionString: resolveDatabaseConnectionString(connectionString),
      ssl: resolveDatabaseSsl(),
      max: parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      options: resolveDatabaseSearchPathOptions(schema),
    });

    // Nest owns this pool. Prisma otherwise preserves externally supplied pools
    // after $disconnect(), leaving sockets alive until idleTimeoutMillis.
    const adapter = new PrismaPg(pool, {
      ...(schema ? { schema } : {}),
      disposeExternalPool: true,
    });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      if (runtimeDatabaseRoleGuardRequired()) {
        const schema = resolveDatabaseSchema(process.env.DATABASE_URL);
        if (!schema) throw new Error('RUNTIME_DATABASE_SCHEMA_REQUIRED');
        const rows = await this.$queryRaw<RuntimeDatabaseRoleState[]>(
          runtimeDatabaseRoleQuery(schema),
        );
        assertRuntimeDatabaseRole(rows, schema);
      }
      console.log('Database connection established.');
    } catch (error) {
      console.error('Database connection failed.');
      if (process.env.NODE_ENV === 'production') {
        await this.$disconnect().catch(() => undefined);
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
