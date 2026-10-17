import { randomBytes } from 'node:crypto';
import pg from 'pg';
import {
  assertRuntimeDatabaseRole,
  runtimeDatabaseRoleQuery,
  type RuntimeDatabaseRoleState,
} from './runtime-database-role';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describePostgres = databaseUrl ? describe : describe.skip;
const quote = (value: string) => `"${value}"`;

describePostgres('runtime privilege guard with PostgreSQL metadata', () => {
  jest.setTimeout(30_000);

  async function fixture(
    run: (context: {
      client: pg.Client;
      schema: string;
      other: string;
      runtime: string;
      parent: string;
      read: () => Promise<RuntimeDatabaseRoleState[]>;
    }) => Promise<void>,
  ) {
    const url = new URL(databaseUrl!);
    if (!/(?:test|audit|ci)/i.test(url.pathname)) {
      throw new Error('Explicit integration database required');
    }
    const client = new pg.Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 5000,
    });
    const suffix = randomBytes(8).toString('hex');
    const schema = `audit_role_guard_${suffix}`;
    const other = `audit_role_guard_other_${suffix}`;
    const runtime = `ps_guard_runtime_${suffix}`;
    const parent = `ps_guard_parent_${suffix}`;
    const createdRoles: string[] = [];
    const createdSchemas: string[] = [];
    let connected = false;
    try {
      await client.connect();
      connected = true;
      for (const name of [schema, other]) {
        await client.query(`CREATE SCHEMA ${quote(name)}`);
        createdSchemas.push(name);
      }
      await client.query(`CREATE TABLE ${quote(other)}.canary (id INTEGER)`);
      for (const role of [runtime, parent]) {
        await client.query(
          `CREATE ROLE ${quote(role)} NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
        );
        createdRoles.push(role);
      }
      await client.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(runtime)}`,
      );
      await client.query(`SET search_path TO ${quote(schema)}, pg_catalog`);
      const read = async () => {
        await client.query(`SET ROLE ${quote(runtime)}`);
        try {
          const query = runtimeDatabaseRoleQuery(schema);
          return (
            await client.query<RuntimeDatabaseRoleState>(
              query.text,
              query.values,
            )
          ).rows;
        } finally {
          await client.query('RESET ROLE');
        }
      };
      await run({ client, schema, other, runtime, parent, read });
    } finally {
      if (connected) {
        await client.query('RESET ROLE');
        const database = (
          await client.query<{ name: string }>(
            'SELECT current_database() AS name',
          )
        ).rows[0].name;
        for (const role of createdRoles) {
          await client.query(
            `REVOKE CREATE ON DATABASE ${quote(database)} FROM ${quote(role)}`,
          );
        }
        for (const name of createdSchemas.reverse()) {
          expect(name).toMatch(/^audit_role_guard_(?:other_)?[a-f0-9]{16}$/);
          await client.query(`DROP SCHEMA ${quote(name)} CASCADE`);
        }
        for (const role of createdRoles.reverse()) {
          expect(role).toMatch(/^ps_guard_(?:runtime|parent)_[a-f0-9]{16}$/);
          await client.query(`DROP ROLE ${quote(role)}`);
        }
      }
      await client.end();
    }
  }

  it('accepts a restricted runtime in its exact schema', async () => {
    await fixture(async ({ schema, read }) => {
      const awaited = await read();
      expect(() => assertRuntimeDatabaseRole(awaited, schema)).not.toThrow();
    });
  });

  it.each(['BYPASSRLS', 'CREATEROLE', 'CREATEDB', 'REPLICATION'])(
    'rejects direct %s privilege',
    async (attribute) => {
      await fixture(async ({ client, schema, runtime, read }) => {
        await client.query(`ALTER ROLE ${quote(runtime)} ${attribute}`);
        const awaited = await read();
        expect(() => assertRuntimeDatabaseRole(awaited, schema)).toThrow(
          'UNSAFE',
        );
      });
    },
  );

  it('rejects privileged membership even when runtime is NOINHERIT', async () => {
    await fixture(async ({ client, schema, runtime, parent, read }) => {
      await client.query(`ALTER ROLE ${quote(parent)} CREATEDB`);
      await client.query(`GRANT ${quote(parent)} TO ${quote(runtime)}`);
      const rows = await read();
      expect(rows[0].create_database).toBe(false);
      expect(rows[0].privileged_membership).toBe(true);
      expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
    });
  });

  it('rejects membership of predefined broad data roles', async () => {
    await fixture(async ({ client, schema, runtime, read }) => {
      await client.query(`GRANT pg_read_all_data TO ${quote(runtime)}`);
      const rows = await read();
      expect(rows[0].privileged_membership).toBe(true);
      expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
    });
  });

  it('rejects CREATE on the database available through an otherwise ordinary NOINHERIT membership', async () => {
    await fixture(async ({ client, schema, runtime, parent, read }) => {
      const database = (
        await client.query<{ name: string }>(
          'SELECT current_database() AS name',
        )
      ).rows[0].name;
      await client.query(
        `GRANT CREATE ON DATABASE ${quote(database)} TO ${quote(parent)}`,
      );
      await client.query(`GRANT ${quote(parent)} TO ${quote(runtime)}`);
      const rows = await read();
      expect(rows[0].database_create).toBe(false);
      expect(rows[0].privileged_membership).toBe(true);
      expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
    });
  });

  it.each(['schema-create', 'schema-owner', 'table-owner', 'member-owner'])(
    'rejects %s in the shared database',
    async (mode) => {
      await fixture(async ({ client, schema, runtime, parent, read }) => {
        if (mode === 'schema-create')
          await client.query(
            `GRANT CREATE ON SCHEMA ${quote(schema)} TO ${quote(runtime)}`,
          );
        if (mode === 'schema-owner')
          await client.query(
            `ALTER SCHEMA ${quote(schema)} OWNER TO ${quote(runtime)}`,
          );
        if (mode === 'table-owner') {
          await client.query(
            `CREATE TABLE ${quote(schema)}.owned_fixture (id INTEGER)`,
          );
          await client.query(
            `ALTER TABLE ${quote(schema)}.owned_fixture OWNER TO ${quote(runtime)}`,
          );
        }
        if (mode === 'member-owner') {
          await client.query(
            `ALTER SCHEMA ${quote(schema)} OWNER TO ${quote(parent)}`,
          );
          await client.query(`GRANT ${quote(parent)} TO ${quote(runtime)}`);
        }
        const rows = await read();
        expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
      });
    },
  );

  it.each([
    'table',
    'column',
    'public-column',
    'reader-membership',
    'sequence',
  ])('rejects effective access outside its schema through %s', async (mode) => {
    await fixture(async ({ client, schema, other, runtime, parent, read }) => {
      const grantee =
        mode === 'public-column'
          ? 'PUBLIC'
          : quote(mode === 'reader-membership' ? parent : runtime);
      await client.query(`GRANT USAGE ON SCHEMA ${quote(other)} TO ${grantee}`);
      if (mode === 'sequence') {
        await client.query(`CREATE SEQUENCE ${quote(other)}.canary_sequence`);
        await client.query(
          `GRANT USAGE ON SEQUENCE ${quote(other)}.canary_sequence TO ${grantee}`,
        );
      } else {
        await client.query(
          `GRANT ${mode.includes('column') ? 'SELECT(id)' : 'SELECT'} ON ${quote(other)}.canary TO ${grantee}`,
        );
      }
      if (mode === 'reader-membership')
        await client.query(`GRANT ${quote(parent)} TO ${quote(runtime)}`);
      const rows = await read();
      expect(rows[0].privileged_membership).toBe(false);
      expect(rows[0].outside_schema_access).toBe(true);
      expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
    });
  });

  it('rejects executable SECURITY DEFINER functions without reading application data', async () => {
    await fixture(async ({ client, schema, other, read }) => {
      await client.query(
        `CREATE FUNCTION ${quote(other)}.elevated() RETURNS INTEGER LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1'`,
      );
      const rows = await read();
      expect(rows[0].privileged_function_access).toBe(true);
      expect(() => assertRuntimeDatabaseRole(rows, schema)).toThrow('UNSAFE');
    });
  });
});
