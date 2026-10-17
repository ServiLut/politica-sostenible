import { Prisma } from '../../prisma/generated/prisma';

export interface RuntimeDatabaseRoleState {
  active_schema: string | null;
  schema_exists: boolean;
  schema_usage: boolean;
  superuser: boolean;
  bypass_rls: boolean;
  create_role: boolean;
  create_database: boolean;
  replication: boolean;
  database_owner: boolean;
  schema_owner: boolean;
  relation_owner: boolean;
  database_create: boolean;
  schema_create: boolean;
  privileged_membership: boolean;
  outside_schema_access: boolean;
  privileged_function_access: boolean;
}

export function runtimeDatabaseRoleGuardRequired(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV === 'production' &&
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() !== 'evaluation'
  );
}

export function runtimeDatabaseRoleQuery(schema: string): Prisma.Sql {
  return Prisma.sql`
    WITH reachable_roles AS MATERIALIZED (
      SELECT oid FROM pg_roles WHERE rolname = current_user OR pg_has_role(current_user, oid, 'MEMBER')
    )
    SELECT current_schema() AS active_schema,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${schema}) AS schema_exists,
      COALESCE((SELECT has_schema_privilege(current_user, oid, 'USAGE')
        FROM pg_namespace WHERE nspname = ${schema}), FALSE) AS schema_usage,
      me.rolsuper AS superuser, me.rolbypassrls AS bypass_rls,
      me.rolcreaterole AS create_role, me.rolcreatedb AS create_database,
      me.rolreplication AS replication,
      EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = me.oid) AS database_owner,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = me.oid AND nspname !~ '^pg_' AND nspname <> 'information_schema') AS schema_owner,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relowner = me.oid AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') AS relation_owner,
      has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
        AND has_schema_privilege(current_user, n.oid, 'CREATE')) AS schema_create,
      EXISTS (
        SELECT 1 FROM pg_roles inherited WHERE inherited.oid <> me.oid
          AND pg_has_role(me.oid, inherited.oid, 'MEMBER')
          AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole
            OR inherited.rolcreatedb OR inherited.rolreplication OR left(inherited.rolname, 3) = 'pg_'
            OR has_database_privilege(inherited.oid, current_database(), 'CREATE')
            OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = inherited.oid)
            OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
              AND (n.nspowner = inherited.oid OR has_schema_privilege(inherited.oid, n.oid, 'CREATE')))
            OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relowner = inherited.oid AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'))
      ) AS privileged_membership,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN reachable_roles r
        WHERE n.nspname <> ${schema} AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
            has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            WHEN c.relkind = 'S' THEN has_sequence_privilege(r.oid, c.oid, 'USAGE,SELECT,UPDATE')
            ELSE FALSE END
      ) AS outside_schema_access,
      EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN reachable_roles r
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prosecdef
          AND p.prorettype <> 'trigger'::regtype AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ) AS privileged_function_access
    FROM pg_roles me WHERE me.rolname = current_user
  `;
}

export function assertRuntimeDatabaseRole(
  rows: RuntimeDatabaseRoleState[],
  schema: string | undefined,
): void {
  if (!schema || !Array.isArray(rows) || rows.length !== 1) {
    throw new Error('RUNTIME_DATABASE_ROLE_METADATA_INVALID');
  }
  const row = rows[0];
  if (!row || typeof row !== 'object') {
    throw new Error('RUNTIME_DATABASE_ROLE_METADATA_INVALID');
  }
  const forbidden: (keyof RuntimeDatabaseRoleState)[] = [
    'superuser',
    'bypass_rls',
    'create_role',
    'create_database',
    'replication',
    'database_owner',
    'schema_owner',
    'relation_owner',
    'database_create',
    'schema_create',
    'privileged_membership',
    'outside_schema_access',
    'privileged_function_access',
  ];
  if (
    row.active_schema !== schema ||
    row.schema_exists !== true ||
    row.schema_usage !== true ||
    forbidden.some((field) => row[field] !== false)
  ) {
    // Do not include roles, connection strings or database metadata in errors.
    throw new Error('RUNTIME_DATABASE_ROLE_UNSAFE');
  }
}
