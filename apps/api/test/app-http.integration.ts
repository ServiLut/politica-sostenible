import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';
import pg from 'pg';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, DivisionType, TaskStatus } from '../prisma/generated/prisma';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import type { OperationReadinessResponseDto } from '../src/operation-profile/dto/operation-readiness.dto';

interface Fixture {
  tenantId: string;
  userId: string;
  email: string;
  divisionId: string;
  token: string;
}
interface Entity {
  id: string;
  tenantId: string;
}
interface TaskRecord extends Entity {
  title: string;
  status: TaskStatus;
}
interface EventRecord extends Entity {
  name: string;
}
interface LeaderRecord extends Entity {
  name: string;
}
function body<T>(response: { body: unknown }): T {
  assert.ok(response.body && typeof response.body === 'object');
  assert.ok('data' in response.body);
  return response.body.data as T;
}

async function redisKeys(redis: Redis): Promise<string[]> {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const page = await redis.scan(
      cursor,
      'MATCH',
      'politica-sostenible*',
      'COUNT',
      1000,
    );
    cursor = page[0];
    keys.push(...page[1]);
  } while (cursor !== '0');
  return keys;
}

void describe(
  'HTTP real: Nest + PostgreSQL + Redis, sin proveedores sustituidos',
  { concurrency: false },
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let redis: Redis;
    const runId = `http_audit_${randomUUID().replaceAll('-', '')}`;
    const password = 'Http-Audit-Only-Password-2026!';
    const fixtures: Fixture[] = [];
    let initialKeys = new Set<string>();
    let task: TaskRecord;

    before(async () => {
      assert.equal(process.env.NODE_ENV, 'development');
      const databaseUrl = new URL(process.env.DATABASE_URL!);
      const redisUrl = new URL(process.env.REDIS_URL!);
      assert.ok(
        ['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname),
      );
      assert.ok(
        ['127.0.0.1', 'localhost', '[::1]'].includes(redisUrl.hostname),
      );
      assert.ok(
        (databaseUrl.username === 'audit_local' &&
          /^\/(politica_audit_|http_audit_)[a-z0-9_]+$/.test(
            databaseUrl.pathname,
          )) ||
          (databaseUrl.username === 'politica_test' &&
            databaseUrl.pathname === '/politica_sostenible_test'),
      );
      assert.equal(
        databaseUrl.searchParams.get('schema'),
        'politica-sostenible',
      );
      assert.equal(redisUrl.pathname, '/14');
      assert.match(process.env.PGAPPNAME ?? '', /^http_audit_[a-f0-9]+$/);
      assert.equal(process.env.SUPABASE_URL, 'https://storage.invalid');
      redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
      assert.equal(await redis.ping(), 'PONG');
      initialKeys = new Set(await redisKeys(redis));
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      app.useGlobalInterceptors(new TransformInterceptor());
      app.useGlobalFilters(new AllExceptionsFilter());
      await app.init();
      prisma = app.get(PrismaService);
      const connectionIdentity = await prisma.$queryRaw<
        Array<{ name: string }>
      >`SELECT current_setting('application_name') AS name`;
      assert.equal(connectionIdentity[0]?.name, process.env.PGAPPNAME);
      const passwordHash = await bcrypt.hash(password, 10);
      for (const suffix of ['a', 'b']) {
        const tenant = await prisma.tenant.create({
          data: {
            slug: `${runId}_${suffix}`,
            name: `${runId}_${suffix}`,
            config: { synthetic: true, owner: 'http-integration-audit', runId },
          },
        });
        const fixture: Fixture = {
          tenantId: tenant.id,
          userId: '',
          email: `${runId}_${suffix}@example.invalid`,
          divisionId: '',
          token: '',
        };
        fixtures.push(fixture);
        const user = await prisma.user.create({
          data: {
            email: fixture.email,
            password: passwordHash,
            name: `${runId} synthetic administrator`,
            role: Role.ADMIN,
            tenantId: tenant.id,
          },
        });
        fixture.userId = user.id;
        const division = await prisma.politicalDivision.create({
          data: {
            name: `${runId} synthetic division`,
            code: `AUDIT_${suffix}`,
            type: DivisionType.DEPARTAMENTO,
            tenantId: tenant.id,
          },
        });
        fixture.divisionId = division.id;
      }
    });

    after(async () => {
      try {
        if (prisma) {
          for (const fixture of fixtures) {
            const tenant = await prisma.tenant.findUnique({
              where: { id: fixture.tenantId },
            });
            assert.ok(tenant?.slug.startsWith(runId));
            await prisma.task.deleteMany({
              where: { tenantId: fixture.tenantId },
            });
            await prisma.campaignEvent.deleteMany({
              where: { tenantId: fixture.tenantId },
            });
            await prisma.territoryLeader.deleteMany({
              where: { tenantId: fixture.tenantId },
            });
            await prisma.user.updateMany({
              where: { tenantId: fixture.tenantId },
              data: { isActive: false, authVersion: { increment: 1 } },
            });
          }
          const auditCount = await prisma.auditEvent.count({
            where: {
              tenantId: { in: fixtures.map((fixture) => fixture.tenantId) },
            },
          });
          console.log(
            `Synthetic fixtures ${runId}: preserved ${auditCount} immutable audit rows; owned users disabled and mutable task/event/leader rows removed.`,
          );
        }
      } finally {
        if (app) await app.close();
        try {
          // Observe from an independent connection: no forceExit and no manual ending
          // of Prisma's pool in the harness may conceal a lifecycle regression.
          if (app) {
            const observer = new pg.Client({
              connectionString: process.env.DATABASE_URL,
              application_name: 'http_audit_shutdown_observer',
            });
            try {
              await observer.connect();
              const remaining = await observer.query<{ count: string }>(
                'SELECT count(*)::text AS count FROM pg_stat_activity WHERE application_name = $1',
                [process.env.PGAPPNAME],
              );
              assert.equal(
                remaining.rows[0]?.count,
                '0',
                'Nest shutdown must immediately close its owned PostgreSQL pool',
              );
            } finally {
              await observer.end();
            }
          }
        } finally {
          if (redis) {
            const ownedKeys = (await redisKeys(redis)).filter(
              (key) => !initialKeys.has(key),
            );
            if (ownedKeys.length) await redis.del(...ownedKeys);
            await redis.quit();
          }
        }
      }
    });

    void it('inicia sesión con bcrypt y JWT reales; rechaza clave errónea, token ausente y firma inválida', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: fixtures[0].email, password: 'wrong-password' })
        .expect(401);
      for (const fixture of fixtures) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: fixture.email, password })
          .expect(201);
        const result = body<{
          access_token: string;
          user: { id: string; tenant: { id: string } };
        }>(response);
        assert.equal(result.user.id, fixture.userId);
        assert.equal(result.user.tenant.id, fixture.tenantId);
        assert.equal(result.access_token.split('.').length, 3);
        fixture.token = result.access_token;
        const me = await request(app.getHttpServer())
          .get('/auth/me')
          .auth(fixture.token, { type: 'bearer' })
          .expect(200);
        assert.equal(
          body<{ user: { tenant: { id: string } } }>(me).user.tenant.id,
          fixture.tenantId,
        );
      }
      await request(app.getHttpServer()).get('/tasks').expect(401);
      await request(app.getHttpServer())
        .get('/tasks')
        .auth('invalid.jwt.signature', { type: 'bearer' })
        .expect(401);
    });

    void it('calcula alistamiento real bloqueado cuando falta el perfil; dashboard lee la organización autenticada', async () => {
      const fixture = fixtures[0];
      const readiness = body<OperationReadinessResponseDto>(
        await request(app.getHttpServer())
          .get('/operation-profile/readiness')
          .auth(fixture.token, { type: 'bearer' })
          .expect(200),
      );
      assert.equal(readiness.stage, null);
      assert.equal(readiness.overall, 'BLOCKED');
      assert.ok(
        Object.values(readiness.sections)
          .flat()
          .some(
            (check) =>
              check.code === 'PROFILE_CONFIGURED' && check.status === 'BLOCK',
          ),
      );
      const briefing = body<Record<string, unknown>>(
        await request(app.getHttpServer())
          .get('/command-center/briefing')
          .auth(fixture.token, { type: 'bearer' })
          .expect(200),
      );
      assert.ok(JSON.stringify(briefing).includes(fixture.tenantId));
      assert.ok(!JSON.stringify(briefing).includes(fixtures[1].tenantId));
    });

    for (const path of [
      '/team/invitations',
      '/tasks',
      '/events',
      '/proposals',
      '/commitments',
      '/cases',
      '/communications/approvals',
      '/voters',
    ]) {
      void it(`GET ${path}: estado vacío paginado real y aislado`, async () => {
        const page = body<{ items: unknown[]; pagination: { total: number } }>(
          await request(app.getHttpServer())
            .get(path)
            .auth(fixtures[0].token, { type: 'bearer' })
            .expect(200),
        );
        assert.deepEqual(page.items, []);
        assert.equal(page.pagination.total, 0);
      });
    }
    for (const path of [
      '/finance',
      '/electoral-catalog/releases',
      '/electoral-catalog/imports',
    ]) {
      void it(`GET ${path}: colección vacía real sin datos de ejemplo`, async () => {
        assert.deepEqual(
          body<unknown[]>(
            await request(app.getHttpServer())
              .get(path)
              .auth(fixtures[0].token, { type: 'bearer' })
              .expect(200),
          ),
          [],
        );
      });
    }
    for (const [path, reason] of [
      ['/finance/closeout', /perfil operativo/i],
      ['/signature-collection', /perfil operativo/i],
      ['/electoral-calendar', /perfil operativo/i],
      ['/scrutiny', /desde Dia D/i],
      ['/witnesses', /etapa vigente/i],
      ['/voters/election-day', /jornada|etapa/i],
    ] as const) {
      void it(`GET ${path}: bloqueo explícito por falta de perfil o etapa`, async () => {
        const result = await request(app.getHttpServer())
          .get(path)
          .auth(fixtures[0].token, { type: 'bearer' })
          .expect(409);
        const failure = result.body as { message: string };
        assert.match(failure.message, reason);
      });
    }
    void it('equipo, bandeja, retención, privacidad y resumen financiero describen el estado real', async () => {
      const get = (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .auth(fixtures[0].token, { type: 'bearer' })
          .expect(200);
      const members = body<{
        items: Array<{ id: string; email: string }>;
        pagination: { total: number };
      }>(await get('/team/members'));
      assert.equal(members.pagination.total, 1);
      assert.equal(members.items[0]?.id, fixtures[0].userId);
      assert.ok(
        !members.items.some((member) => member.id === fixtures[1].userId),
      );
      const inbox = body<{ items: unknown[]; summary: { total: number } }>(
        await get('/operational-inbox'),
      );
      assert.deepEqual(inbox.items, []);
      assert.equal(inbox.summary.total, 0);
      const retention = body<{
        profile: unknown;
        requests: unknown[];
        legalHolds: unknown[];
      }>(await get('/retention-governance'));
      assert.equal(retention.profile, null);
      assert.deepEqual(retention.requests, []);
      assert.deepEqual(retention.legalHolds, []);
      const notice = body<{ configured: boolean; notice: unknown }>(
        await get('/consent-notices/current'),
      );
      assert.equal(notice.configured, false);
      assert.equal(notice.notice, null);
      const summary = body<{
        totalIncome: number;
        totalExpenses: number;
        limitsConfigured: boolean;
      }>(await get('/finance/summary'));
      assert.equal(summary.totalIncome, 0);
      assert.equal(summary.totalExpenses, 0);
      assert.equal(summary.limitsConfigured, false);
    });

    void it('crea tarea, lee lo persistido, la actualiza y la cancela; tenant B no puede verla ni modificarla', async () => {
      const [a, b] = fixtures;
      task = body<TaskRecord>(
        await request(app.getHttpServer())
          .post('/tasks')
          .auth(a.token, { type: 'bearer' })
          .send({ title: `${runId} task`, assigneeId: a.userId })
          .expect(201),
      );
      assert.equal(task.tenantId, a.tenantId);
      const list = body<{ items: TaskRecord[] }>(
        await request(app.getHttpServer())
          .get('/tasks')
          .query({ entityId: task.id })
          .auth(a.token, { type: 'bearer' })
          .expect(200),
      );
      assert.equal(list.items[0]?.id, task.id);
      assert.equal(
        (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title,
        task.title,
      );
      const otherList = body<{ items: TaskRecord[] }>(
        await request(app.getHttpServer())
          .get('/tasks')
          .query({ entityId: task.id })
          .auth(b.token, { type: 'bearer' })
          .expect(200),
      );
      assert.deepEqual(otherList.items, []);
      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .auth(b.token, { type: 'bearer' })
        .send({ title: 'unauthorized alteration' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .auth(a.token, { type: 'bearer' })
        .send({ title: `${runId} updated`, status: 'IN_PROGRESS' })
        .expect(200);
      assert.equal(
        (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
          .status,
        'IN_PROGRESS',
      );
      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .auth(a.token, { type: 'bearer' })
        .send({ status: 'CANCELLED' })
        .expect(200);
      assert.equal(
        (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
          .status,
        'CANCELLED',
      );
      const final = body<{ items: TaskRecord[] }>(
        await request(app.getHttpServer())
          .get('/tasks')
          .query({ entityId: task.id })
          .auth(a.token, { type: 'bearer' })
          .expect(200),
      );
      assert.equal(final.items[0]?.status, 'CANCELLED');
    });

    void it('crea, consulta, modifica y elimina un borrador de evento; bloquea lectura y escritura de tenant B', async () => {
      const [a, b] = fixtures;
      const startsAt = new Date(Date.now() + 86_400_000).toISOString();
      const endsAt = new Date(Date.now() + 90_000_000).toISOString();
      const event = body<EventRecord>(
        await request(app.getHttpServer())
          .post('/events')
          .auth(a.token, { type: 'bearer' })
          .send({
            name: `${runId} event`,
            startsAt,
            endsAt,
            responsibleId: a.userId,
          })
          .expect(201),
      );
      assert.equal(
        (
          await prisma.campaignEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).tenantId,
        a.tenantId,
      );
      assert.equal(
        body<EventRecord>(
          await request(app.getHttpServer())
            .get(`/events/${event.id}`)
            .auth(a.token, { type: 'bearer' })
            .expect(200),
        ).id,
        event.id,
      );
      await request(app.getHttpServer())
        .get(`/events/${event.id}`)
        .auth(b.token, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/events/${event.id}`)
        .auth(b.token, { type: 'bearer' })
        .send({ name: 'unauthorized event' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/events/${event.id}`)
        .auth(b.token, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/events/${event.id}`)
        .auth(a.token, { type: 'bearer' })
        .send({ name: `${runId} updated event` })
        .expect(200);
      assert.equal(
        (
          await prisma.campaignEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).name,
        `${runId} updated event`,
      );
      await request(app.getHttpServer())
        .delete(`/events/${event.id}`)
        .auth(a.token, { type: 'bearer' })
        .expect(200);
      await request(app.getHttpServer())
        .get(`/events/${event.id}`)
        .auth(a.token, { type: 'bearer' })
        .expect(404);
      assert.equal(
        await prisma.campaignEvent.count({
          where: { id: event.id, tenantId: a.tenantId },
        }),
        0,
      );
    });

    void it('persiste cambios de líder y elimina con lectura posterior; otro tenant no accede a la división', async () => {
      const [a, b] = fixtures;
      const path = `/campaigns/divisions/${a.divisionId}/leaders`;
      const leader = body<LeaderRecord>(
        await request(app.getHttpServer())
          .post(path)
          .auth(a.token, { type: 'bearer' })
          .send({
            name: `${runId} synthetic leader`,
            roleDescription: 'Only local integration fixture',
          })
          .expect(201),
      );
      assert.equal(leader.tenantId, a.tenantId);
      assert.ok(
        body<LeaderRecord[]>(
          await request(app.getHttpServer())
            .get(path)
            .auth(a.token, { type: 'bearer' })
            .expect(200),
        ).some((item) => item.id === leader.id),
      );
      await request(app.getHttpServer())
        .get(path)
        .auth(b.token, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .post(path)
        .auth(b.token, { type: 'bearer' })
        .send({ name: 'unauthorized leader', roleDescription: 'rejected' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${path}/${leader.id}`)
        .auth(b.token, { type: 'bearer' })
        .send({ name: 'unauthorized alteration' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${path}/${leader.id}`)
        .auth(b.token, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${path}/${leader.id}`)
        .auth(a.token, { type: 'bearer' })
        .send({ name: `${runId} updated leader` })
        .expect(200);
      assert.equal(
        (
          await prisma.territoryLeader.findUniqueOrThrow({
            where: { id: leader.id },
          })
        ).name,
        `${runId} updated leader`,
      );
      await request(app.getHttpServer())
        .delete(`${path}/${leader.id}`)
        .auth(a.token, { type: 'bearer' })
        .expect(200);
      assert.deepEqual(
        body<LeaderRecord[]>(
          await request(app.getHttpServer())
            .get(path)
            .auth(a.token, { type: 'bearer' })
            .expect(200),
        ),
        [],
      );
      assert.equal(
        await prisma.territoryLeader.count({
          where: { id: leader.id, tenantId: a.tenantId },
        }),
        0,
      );
    });

    void it('rechaza tenantId enviado por el cliente y tipos inválidos antes de persistir', async () => {
      const [a, b] = fixtures;
      const count = await prisma.task.count({
        where: { tenantId: a.tenantId },
      });
      await request(app.getHttpServer())
        .post('/tasks')
        .auth(a.token, { type: 'bearer' })
        .send({ title: 'forged tenant', tenantId: b.tenantId })
        .expect(400);
      await request(app.getHttpServer())
        .post('/tasks')
        .auth(a.token, { type: 'bearer' })
        .send({ title: 'invalid status', status: 'NOT_A_STATUS' })
        .expect(400);
      assert.equal(
        await prisma.task.count({ where: { tenantId: a.tenantId } }),
        count,
      );
    });

    void it('prueba auditoría persistida, uso de Redis y revocación del JWT al cerrar sesiones', async () => {
      const fixture = fixtures[0];
      assert.ok(
        (await prisma.auditEvent.count({
          where: { tenantId: fixture.tenantId, actorUserId: fixture.userId },
        })) > 0,
      );
      const audit = body<{ items: Array<{ resourceId: string | null }> }>(
        await request(app.getHttpServer())
          .get('/audit-events')
          .auth(fixture.token, { type: 'bearer' })
          .expect(200),
      );
      assert.ok(audit.items.some((item) => item.resourceId === task.id));
      assert.ok(
        (await redisKeys(redis)).some((key) =>
          key.startsWith('politica-sostenible:throttle:v1:'),
        ),
      );
      await request(app.getHttpServer())
        .post('/auth/logout')
        .auth(fixture.token, { type: 'bearer' })
        .expect(201);
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(fixture.token, { type: 'bearer' })
        .expect(401);
    });
  },
);
