import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  PrismaClient,
  Prisma,
  PersonImportStatus,
  Role,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../common/services/identity.service';
import { ImportService, REQUIRED_HEADERS } from './import.service';
import { PersonImportService } from './person-import.service';
import type { PersonImportArtifactService } from './person-import-artifact.service';
import { claimStorageOrphan } from '../storage/storage-orphan-claim';
import { lockOperationLifecycleSnapshot } from '../common/utils/operation-lifecycle-fence.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';

const databaseUrl = process.env.PERSON_IMPORT_TEST_DATABASE_URL;
const physical = databaseUrl ? describe : describe.skip;
const schema = 'person_import_20261006';

physical(
  'Person import transactions on isolated physical PostgreSQL 16',
  () => {
    jest.setTimeout(60_000);
    let client: PrismaClient;
    let pool: pg.Pool;
    let service: PersonImportService;
    const files = new Map<string, Buffer>();
    const queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
    const hash = (bytes: Buffer) =>
      createHash('sha256').update(bytes).digest('hex');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400_000);

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.port !== '15462' ||
        url.pathname !== '/person_import_20261006' ||
        url.username !== 'politica_test' ||
        url.searchParams.get('schema') !== schema
      )
        throw new Error('PERSON_IMPORT_PHYSICAL_DATABASE_SCOPE_REFUSED');
      pool = new pg.Pool({
        connectionString: databaseUrl,
        ssl: false,
        options: `-c search_path=${schema}`,
        max: 5,
      });
      const identity = await pool.query(
        "SELECT current_database() AS db, current_user AS actor, current_setting('server_version') AS version",
      );
      expect(identity.rows[0]).toMatchObject({
        db: schema,
        actor: 'politica_test',
      });
      expect(identity.rows[0].version).toMatch(/^16\./u);
      client = new PrismaClient({
        adapter: new PrismaPg(pool, { schema, disposeExternalPool: true }),
      });
      const prisma = client as unknown as PrismaService;
      const artifacts = {
        withVerifiedCsv: async <T>(
          path: string,
          size: number,
          sha: string,
          consume: (bytes: AsyncIterable<Uint8Array>) => Promise<T>,
        ): Promise<T> => {
          const bytes = files.get(path);
          if (!bytes || bytes.length !== size || hash(bytes) !== sha)
            throw new Error('FIXTURE_BYTES_MISMATCH');
          return consume(Readable.from([bytes]));
        },
      };
      service = new PersonImportService(
        prisma,
        new ImportService(prisma, new IdentityService()),
        artifacts as PersonImportArtifactService,
        queue,
      );
    });
    afterAll(async () => {
      await client?.$disconnect();
    });

    async function actor(noticeVersion = 'QA-SIMULACION-v1') {
      const tenant = await client.tenant.create({
        data: {
          slug: `person-import-test-${randomUUID()}`,
          name: 'PRUEBA SIMULACION SIN VALIDEZ',
          type: 'CANDIDACY',
          defaultMode: 'CAMPAIGN',
        },
      });
      const user = await client.user.create({
        data: {
          tenantId: tenant.id,
          email: `${randomUUID()}@example.invalid`,
          password: 'NO_LOGIN_TEST_FIXTURE',
          name: 'PRUEBA ADMIN',
          role: Role.ADMIN,
        },
      });
      const plan = await client.subscriptionPlan.findUniqueOrThrow({
        where: { code: 'PROFESSIONAL' },
      });
      await client.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: yesterday,
          currentPeriodEnd: new Date(now.getTime() + 86400_000),
        },
      });
      await client.consentNotice.create({
        data: {
          tenantId: tenant.id,
          createdById: user.id,
          mode: 'CAMPAIGN',
          purpose: 'POLITICAL_COMMUNICATION',
          version: noticeVersion,
          title: 'SIMULACION SIN VALIDEZ',
          content:
            'Datos ficticios para probar software. No representa consentimiento real.',
          controllerName: 'PRUEBA',
          contactEmail: 'qa@example.invalid',
          activatedAt: yesterday,
        },
      });
      await client.operationProfile.create({
        data: {
          tenantId: tenant.id,
          operationType: 'SINGLE_CANDIDACY',
          stage: 'EXPLORATION',
          electionType: 'MAYORALTY',
          circumscriptionType: 'MUNICIPAL',
          circumscriptionName: 'SIMULACION',
          electionDate: new Date('2030-10-01'),
          votingStartDate: new Date('2030-10-01'),
          votingEndDate: new Date('2030-10-01'),
          expectedTeamSize: 2,
          dataControllerName: 'PRUEBA',
          responsibleDataUserId: user.id,
          retentionPeriodDays: 30,
          revocationProcedure: 'SIMULACION SIN VALIDEZ',
          createdById: user.id,
          updatedById: user.id,
        },
      });
      return {
        tenantId: tenant.id,
        userId: user.id,
        role: Role.ADMIN,
        noticeVersion,
      };
    }
    type Actor = Awaited<ReturnType<typeof actor>>;
    async function proof(user: Actor) {
      const path = `${user.tenantId}/consent/${randomUUID()}.pdf`;
      await stored(
        user,
        path,
        StorageObjectModule.CONSENT,
        Buffer.from('%PDF-1.4 SIMULACION TEST FIXTURE'),
      );
      return path;
    }
    async function stored(
      user: Actor,
      path: string,
      module: StorageObjectModule,
      bytes: Buffer,
    ) {
      return client.storedObject.create({
        data: {
          tenantId: user.tenantId,
          uploaderId: user.userId,
          path,
          module,
          contentType:
            module === StorageObjectModule.PERSON_IMPORT
              ? 'text/csv'
              : 'application/pdf',
          expectedSize: bytes.length,
          actualSize: bytes.length,
          expectedSha256: hash(bytes),
          reportedSha256: hash(bytes),
          calculatedSha256: hash(bytes),
          integrityStatus: 'VERIFIED',
          observedSize: bytes.length,
          observedContentType:
            module === StorageObjectModule.PERSON_IMPORT
              ? 'text/csv'
              : 'application/pdf',
          integrityCheckedAt: now,
          integrityVerifiedAt: now,
          status: 'CONFIRMED',
          confirmedAt: now,
          expiresAt: new Date(now.getTime() + 3600_000),
        },
      });
    }
    async function source(user: Actor, rows: string[]) {
      const bytes = Buffer.from(
        `${REQUIRED_HEADERS.join(',')}\n${rows.join('\n')}`,
      );
      const path = `${user.tenantId}/person-import/${randomUUID()}.csv`;
      files.set(path, bytes);
      await stored(user, path, StorageObjectModule.PERSON_IMPORT, bytes);
      const dto = {
        clientRequestId: randomUUID(),
        fileName: 'PRUEBA.csv',
        sourceArtifactPath: path,
        expectedContentSha256: hash(bytes),
      };
      const job = await service.create(user, dto);
      return { job, dto };
    }
    const row = (user: Actor, document: string, path: string, consent = 'SI') =>
      `${document},PRUEBA,SIMULACION,${consent},${user.noticeVersion},${now.toISOString()},${path}`;

    async function orphanCandidate(user: Actor, path: string) {
      await client.storedObject.updateMany({
        where: { tenantId: user.tenantId, path, status: 'CONFIRMED' },
        data: { confirmedAt: new Date(now.getTime() - 3 * 86400_000) },
      });
      return client.storedObject.findFirstOrThrow({
        where: { tenantId: user.tenantId, path },
        select: { id: true, path: true, module: true, status: true },
      });
    }

    it.each([
      PersonImportStatus.QUEUED,
      PersonImportStatus.VALIDATING,
      PersonImportStatus.READY,
      PersonImportStatus.IMPORT_QUEUED,
      PersonImportStatus.IMPORTING,
      PersonImportStatus.FAILED,
    ])('preserves aged consent evidence for a %s import', async (status) => {
      const user = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '910000001', path)]);
      const beforeParse =
        status === PersonImportStatus.QUEUED ||
        status === PersonImportStatus.VALIDATING;
      if (!beforeParse) await service.process(job.id, user.tenantId);
      await client.personImportJob.update({
        where: { id_tenantId: { id: job.id, tenantId: user.tenantId } },
        data: {
          status,
          lastErrorCode:
            status === PersonImportStatus.FAILED
              ? 'PROCESSING_INTERRUPTED'
              : null,
          importRequestedAt: status === PersonImportStatus.FAILED ? now : null,
        },
      });
      const candidate = await orphanCandidate(user, path);
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, candidate, now, yesterday),
        ),
      ).toBe(false);
      expect(
        await client.storedObject.findFirst({
          where: { id: candidate.id, tenantId: user.tenantId },
        }),
      ).toMatchObject({ status: 'CONFIRMED', integrityStatus: 'VERIFIED' });
    });

    it('reserves unparsed recoverable jobs, releases terminal invalid files, and isolates tenants', async () => {
      const user = await actor();
      const other = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '910000002', path)]);
      await client.personImportJob.update({
        where: { id_tenantId: { id: job.id, tenantId: user.tenantId } },
        data: { status: 'FAILED', lastErrorCode: 'PROCESSING_INTERRUPTED' },
      });
      const candidate = await orphanCandidate(user, path);
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, candidate, now, yesterday),
        ),
      ).toBe(false);
      const otherCandidate = await orphanCandidate(other, await proof(other));
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(
            tx,
            other.tenantId,
            otherCandidate,
            now,
            yesterday,
          ),
        ),
      ).toBe(true);
      await client.personImportJob.update({
        where: { id_tenantId: { id: job.id, tenantId: user.tenantId } },
        data: { lastErrorCode: 'INVALID_FILE' },
      });
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, candidate, now, yesterday),
        ),
      ).toBe(true);
    });

    it('keeps only referenced evidence after READY and observes the real PostgreSQL access plan', async () => {
      const user = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '910000003', path)]);
      await service.process(job.id, user.tenantId);
      const candidate = await orphanCandidate(user, path);
      const unreferenced = await orphanCandidate(user, await proof(user));
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, unreferenced, now, yesterday),
        ),
      ).toBe(true);
      let protectionQuery: Prisma.Sql | undefined;
      expect(
        await client.$transaction(async (tx) => {
          const traced = {
            storedObject: tx.storedObject,
            $queryRaw: (query: Prisma.Sql) => {
              if (query.text.includes('AS "protected"'))
                protectionQuery = query;
              return tx.$queryRaw(query);
            },
          } as unknown as Prisma.TransactionClient;
          return claimStorageOrphan(
            traced,
            user.tenantId,
            candidate,
            now,
            yesterday,
          );
        }),
      ).toBe(false);
      expect(protectionQuery).toBeDefined();
      const indexes = await pool.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename IN ('PersonImportJob','PersonImportRowResult') ORDER BY indexname`,
        [schema],
      );
      expect(indexes.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indexname: 'PersonImportRowResult_tenantId_jobId_proofPath_idx',
          }),
          expect.objectContaining({
            indexname: 'PersonImportJob_tenantId_status_createdAt_id_idx',
          }),
        ]),
      );
      const explain = await pool.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${protectionQuery!.text}`,
        protectionQuery!.values,
      );
      if (process.env.PERSON_IMPORT_EXPLAIN_OUTPUT)
        writeFileSync(
          process.env.PERSON_IMPORT_EXPLAIN_OUTPUT,
          JSON.stringify(
            {
              checkedAt: new Date().toISOString(),
              syntheticFixturesOnly: true,
              schema,
              indexes: indexes.rows,
              explain: explain.rows,
            },
            null,
            2,
          ),
        );
      await client.personImportJob.update({
        where: { id_tenantId: { id: job.id, tenantId: user.tenantId } },
        data: { status: 'COMPLETED' },
      });
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, candidate, now, yesterday),
        ),
      ).toBe(true);
    });

    async function waitForAdvisoryWait(pid: number) {
      for (let index = 0; index < 50; index++) {
        const result = await pool.query(
          'SELECT wait_event FROM pg_stat_activity WHERE pid=$1',
          [pid],
        );
        if (result.rows[0]?.wait_event === 'advisory') return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('SYNTHETIC_ADVISORY_WAIT_NOT_OBSERVED');
    }

    it('makes cleanup wait for a reservation transaction and then preserve the proof', async () => {
      const user = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '910000004', path)]);
      await service.process(job.id, user.tenantId);
      await client.personImportJob.update({
        where: { id_tenantId: { id: job.id, tenantId: user.tenantId } },
        data: { status: 'COMPLETED' },
      });
      const candidate = await orphanCandidate(user, path);
      let unlock!: () => void;
      let acquired!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const reservation = client.$transaction(
        async (tx) => {
          await lockOperationLifecycleSnapshot(tx, user.tenantId);
          await tx.personImportJob.updateMany({
            where: { tenantId: user.tenantId, id: job.id },
            data: { status: 'READY' },
          });
          acquired();
          await release;
        },
        { timeout: 10_000 },
      );
      await Promise.race([locked, reservation]);
      let observed!: (pid: number) => void;
      const cleanupPid = new Promise<number>((resolve) => {
        observed = resolve;
      });
      const cleanup = client.$transaction(
        async (tx) => {
          const [identity] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          observed(identity.pid);
          return claimStorageOrphan(
            tx,
            user.tenantId,
            candidate,
            now,
            yesterday,
          );
        },
        { timeout: 10_000 },
      );
      try {
        await waitForAdvisoryWait(await cleanupPid);
      } finally {
        unlock();
      }
      await reservation;
      expect(await cleanup).toBe(false);
    });

    it('a cleanup claim committed first prevents subsequent consumption and person creation', async () => {
      const user = await actor();
      const path = await proof(user);
      const candidate = await orphanCandidate(user, path);
      let unlock!: () => void;
      let acquired!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const cleanup = client.$transaction(
        async (tx) => {
          expect(
            await claimStorageOrphan(
              tx,
              user.tenantId,
              candidate,
              now,
              yesterday,
            ),
          ).toBe(true);
          acquired();
          await release;
        },
        { timeout: 10_000 },
      );
      await Promise.race([locked, cleanup]);
      let observed!: (pid: number) => void;
      const consumePid = new Promise<number>((resolve) => {
        observed = resolve;
      });
      const consumption = client
        .$transaction(
          async (tx) => {
            const [identity] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            observed(identity.pid);
            await lockOperationLifecycleSnapshot(tx, user.tenantId);
            await consumeConfirmedStorageUpload(
              tx,
              user.tenantId,
              path,
              StorageObjectModule.CONSENT,
              'TEST_ONLY',
              'synthetic',
              user.userId,
              {
                expectedSha256: hash(
                  Buffer.from('%PDF-1.4 SIMULACION TEST FIXTURE'),
                ),
              },
            );
          },
          { timeout: 10_000 },
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      try {
        await waitForAdvisoryWait(await consumePid);
      } finally {
        unlock();
      }
      await cleanup;
      expect(await consumption).toMatchObject({ status: 400 });
      const { job } = await source(user, [row(user, '910000005', path)]);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'READY',
        validRows: 0,
        errorRows: 1,
      });
      expect(
        await client.voter.count({ where: { tenantId: user.tenantId } }),
      ).toBe(0);
    });

    it('does not expire an object still owned by byte verification', async () => {
      const user = await actor();
      const bytes = Buffer.from('%PDF-1.4 SIMULACION PENDING');
      const candidate = await client.storedObject.create({
        data: {
          tenantId: user.tenantId,
          uploaderId: user.userId,
          path: `${user.tenantId}/consent/${randomUUID()}.pdf`,
          module: 'CONSENT',
          contentType: 'application/pdf',
          expectedSize: bytes.length,
          actualSize: bytes.length,
          expectedSha256: hash(bytes),
          reportedSha256: hash(bytes),
          integrityStatus: 'PENDING',
          status: 'CONFIRMED',
          confirmedAt: new Date(now.getTime() - 3 * 86400_000),
          expiresAt: yesterday,
        },
      });
      expect(
        await client.$transaction((tx) =>
          claimStorageOrphan(tx, user.tenantId, candidate, now, yesterday),
        ),
      ).toBe(false);
      expect(
        await client.storedObject.findFirst({
          where: { tenantId: user.tenantId, id: candidate.id },
        }),
      ).toMatchObject({ status: 'CONFIRMED', integrityStatus: 'PENDING' });
    });

    it('makes cleanup lose to a committed consumer and keeps the immutable digest', async () => {
      const user = await actor();
      const path = await proof(user);
      const candidate = await orphanCandidate(user, path);
      let unlock!: () => void;
      let acquired!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const consumption = client.$transaction(
        async (tx) => {
          await lockOperationLifecycleSnapshot(tx, user.tenantId);
          await consumeConfirmedStorageUpload(
            tx,
            user.tenantId,
            path,
            StorageObjectModule.CONSENT,
            'TEST_ONLY',
            'synthetic',
            user.userId,
            {
              expectedSha256: hash(
                Buffer.from('%PDF-1.4 SIMULACION TEST FIXTURE'),
              ),
            },
          );
          acquired();
          await release;
        },
        { timeout: 10_000 },
      );
      await Promise.race([locked, consumption]);
      let observed!: (pid: number) => void;
      const cleanupPid = new Promise<number>((resolve) => {
        observed = resolve;
      });
      const cleanup = client.$transaction(
        async (tx) => {
          const [identity] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          observed(identity.pid);
          return claimStorageOrphan(
            tx,
            user.tenantId,
            candidate,
            now,
            yesterday,
          );
        },
        { timeout: 10_000 },
      );
      try {
        await waitForAdvisoryWait(await cleanupPid);
      } finally {
        unlock();
      }
      await consumption;
      expect(await cleanup).toBe(false);
      expect(
        await client.storedObject.findFirst({
          where: { tenantId: user.tenantId, id: candidate.id },
        }),
      ).toMatchObject({ status: 'CONSUMED', integrityStatus: 'VERIFIED' });
    });

    it('persists preview and imports only verified rows; replay preserves voters, consent and evidence ownership', async () => {
      const user = await actor();
      const first = await proof(user);
      const second = await proof(user);
      const { job, dto } = await source(user, [
        row(user, '900000001', first),
        row(user, '900000002', second),
        row(
          user,
          '900000003',
          `${user.tenantId}/consent/${randomUUID()}.pdf`,
          'NO',
        ),
      ]);
      expect((await service.create(user, dto)).id).toBe(job.id);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'READY',
        totalRows: 3,
        validRows: 2,
        errorRows: 1,
      });
      await service.execute(user, job.id);
      await Promise.all([
        service.process(job.id, user.tenantId),
        service.process(job.id, user.tenantId),
      ]);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'COMPLETED',
        importedRows: 2,
        errorRows: 1,
        validRows: 0,
      });
      await service.execute(user, job.id);
      await service.process(job.id, user.tenantId);
      expect(
        await client.voter.count({ where: { tenantId: user.tenantId } }),
      ).toBe(2);
      expect(
        await client.consentRecord.count({
          where: {
            tenantId: user.tenantId,
            noticeVersion: user.noticeVersion,
            collectionChannel: 'IMPORT',
            status: 'GRANTED',
          },
        }),
      ).toBe(2);
      const evidence = await client.storedObject.findMany({
        where: { tenantId: user.tenantId, module: 'CONSENT' },
      });
      expect(
        evidence.every(
          (item) =>
            item.status === 'CONSUMED' &&
            item.consumedByType === 'VoterConsent',
        ),
      ).toBe(true);
      expect(
        (await service.errors(user, job.id, { page: 1, limit: 20 })).items,
      ).toHaveLength(1);
    });

    it('detects duplicate documents and evidence across the 250-row checkpoint and keeps all errors durable', async () => {
      const user = await actor();
      const a = await proof(user);
      const b = await proof(user);
      const rows = Array.from({ length: 251 }, (_, index) =>
        row(
          user,
          String(910000000 + index),
          `${user.tenantId}/consent/${randomUUID()}.pdf`,
          'NO',
        ),
      );
      rows[0] = row(user, '919999999', a);
      rows[250] = row(user, '919999999', b);
      const { job } = await source(user, rows);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'READY',
        totalRows: 251,
        errorRows: 251,
        validRows: 0,
      });
      const duplicates = await client.personImportRowResult.findMany({
        where: {
          tenantId: user.tenantId,
          jobId: job.id,
          documentId: '919999999',
        },
      });
      expect(duplicates).toHaveLength(2);
      expect(
        duplicates.every(
          (r) =>
            r.status === 'INVALID' &&
            JSON.stringify(r.errors).includes('repetido'),
        ),
      ).toBe(true);
      for (const duplicate of duplicates) {
        expect(
          (duplicate.errors as Array<{ field: string }>).filter(
            (error) => error.field === 'Documento',
          ),
        ).toHaveLength(1);
      }
      expect(
        await client.voter.count({ where: { tenantId: user.tenantId } }),
      ).toBe(0);
    });

    it('emits one duplicate reason per field while retaining unrelated row errors', async () => {
      const user = await actor();
      const sameProof = await proof(user);
      const { job } = await source(user, [
        row(user, '915555555', sameProof),
        row(user, '915555555', sameProof, 'NO'),
      ]);
      await service.process(job.id, user.tenantId);
      const result = await service.errors(user, job.id, { page: 1, limit: 20 });
      expect(result.items).toHaveLength(2);
      for (const item of result.items) {
        const errors = item.errors as Array<{ field: string; message: string }>;
        expect(
          errors.filter((error) => error.field === 'Documento'),
        ).toHaveLength(1);
        expect(
          errors.filter((error) => error.field === 'Ruta evidencia'),
        ).toHaveLength(1);
      }
      expect(
        (result.items[1].errors as Array<{ field: string }>).some(
          (error) => error.field === 'Consentimiento',
        ),
      ).toBe(true);
      expect(await service.get(user, job.id)).toMatchObject({
        totalRows: 2,
        errorRows: 2,
        validRows: 0,
      });
    });

    it('recovers expired validation leases without restaging or doubling checkpoint counters', async () => {
      const user = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '920000001', path)]);
      await service.process(job.id, user.tenantId);
      await client.personImportJob.updateMany({
        where: { tenantId: user.tenantId, id: job.id },
        data: {
          status: 'VALIDATING',
          leaseToken: randomUUID(),
          leaseExpiresAt: yesterday,
        },
      });
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'READY',
        totalRows: 1,
        validRows: 1,
        attempts: 2,
      });
      expect(
        await client.personImportRowResult.count({
          where: { tenantId: user.tenantId, jobId: job.id },
        }),
      ).toBe(1);
    });

    it('rolls back voters, consent, consumed evidence and row progress together when a later SQL write fails', async () => {
      const user = await actor('QA-ROLLBACK');
      const path = await proof(user);
      const { job } = await source(user, [row(user, '930000001', path)]);
      await service.process(job.id, user.tenantId);
      await service.execute(user, job.id);
      await pool.query(
        `CREATE FUNCTION "qa_person_import_fail"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."noticeVersion"='QA-ROLLBACK' THEN RAISE EXCEPTION 'SYNTHETIC_INJECTED_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER "qa_person_import_fail" BEFORE INSERT ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION "qa_person_import_fail"()`,
      );
      try {
        await service.process(job.id, user.tenantId);
        expect(await service.get(user, job.id)).toMatchObject({
          status: 'FAILED',
          importedRows: 0,
          validRows: 1,
          canRetry: true,
        });
        expect(
          await client.voter.count({ where: { tenantId: user.tenantId } }),
        ).toBe(0);
        expect(
          await client.consentRecord.count({
            where: { tenantId: user.tenantId },
          }),
        ).toBe(0);
        expect(
          await client.storedObject.findFirst({
            where: { tenantId: user.tenantId, path },
          }),
        ).toMatchObject({ status: 'CONFIRMED', consumedAt: null });
      } finally {
        await pool.query(
          'DROP TRIGGER "qa_person_import_fail" ON "ConsentRecord"; DROP FUNCTION "qa_person_import_fail"()',
        );
      }
      await service.retry(user, job.id);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'COMPLETED',
        importedRows: 1,
        validRows: 0,
      });
    });

    it('keeps tenant-specific identities independent and composite foreign keys reject cross-tenant rows', async () => {
      const a = await actor();
      const b = await actor();
      const first = await source(a, [row(a, '940000001', await proof(a))]);
      await expect(service.get(b, first.job.id)).rejects.toThrow(
        'no encontrada',
      );
      await expect(
        client.personImportRowResult.create({
          data: {
            tenantId: b.tenantId,
            jobId: first.job.id,
            rowNumber: 999,
            values: {},
            errors: [],
            status: 'READY',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      for (const [user, item] of [
        [a, first],
        [b, await source(b, [row(b, '940000001', await proof(b))])],
      ] as const) {
        await service.process(item.job.id, user.tenantId);
        await service.execute(user, item.job.id);
        await service.process(item.job.id, user.tenantId);
        expect(
          await client.voter.count({
            where: { tenantId: user.tenantId, documentId: '940000001' },
          }),
        ).toBe(1);
      }
    });

    it('rechecks evidence and notice at execution without inventing consent after a successful preview', async () => {
      const user = await actor();
      const path = await proof(user);
      const { job } = await source(user, [row(user, '950000001', path)]);
      await service.process(job.id, user.tenantId);
      await service.execute(user, job.id);
      await client.storedObject.updateMany({
        where: { tenantId: user.tenantId, path },
        data: {
          status: 'CONSUMED',
          consumedAt: now,
          consumedByType: 'TEST_OTHER_USE',
          consumedById: 'synthetic',
        },
      });
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'COMPLETED',
        errorRows: 1,
        importedRows: 0,
      });
      expect(
        await client.consentRecord.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBe(0);
    });
    it('rechecks real plan quota within the batch transaction and resumes when capacity returns', async () => {
      const user = await actor();
      const { job } = await source(user, [
        row(user, '970000001', await proof(user)),
        row(user, '970000002', await proof(user)),
      ]);
      await service.process(job.id, user.tenantId);
      await service.execute(user, job.id);
      const plan = await client.subscriptionPlan.findUniqueOrThrow({
        where: { code: 'PROFESSIONAL' },
      });
      await client.subscriptionPlan.update({
        where: { id: plan.id },
        data: { maxVoters: 1 },
      });
      try {
        await service.process(job.id, user.tenantId);
        expect(await service.get(user, job.id)).toMatchObject({
          status: 'FAILED',
          lastErrorCode: 'AUTHORIZATION_OR_QUOTA',
          importedRows: 0,
          validRows: 2,
        });
        expect(
          await client.voter.count({ where: { tenantId: user.tenantId } }),
        ).toBe(0);
      } finally {
        await client.subscriptionPlan.update({
          where: { id: plan.id },
          data: { maxVoters: plan.maxVoters },
        });
      }
      await service.retry(user, job.id);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'COMPLETED',
        importedRows: 2,
      });
    });
    it('preserves the committed first batch and retries only remaining rows after second-batch SQL failure', async () => {
      const user = await actor('QA-PARTIAL');
      const rows: string[] = [];
      for (let index = 0; index < 251; index++)
        rows.push(row(user, String(980000000 + index), await proof(user)));
      const { job } = await source(user, rows);
      await service.process(job.id, user.tenantId);
      await service.execute(user, job.id);
      await pool.query(
        `CREATE FUNCTION "qa_person_import_partial"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."noticeVersion"='QA-PARTIAL' AND EXISTS(SELECT 1 FROM "Voter" WHERE "id"=NEW."voterId" AND "documentId"='980000250') THEN RAISE EXCEPTION 'SYNTHETIC_SECOND_BATCH_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER "qa_person_import_partial" BEFORE INSERT ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION "qa_person_import_partial"()`,
      );
      try {
        await service.process(job.id, user.tenantId);
        expect(await service.get(user, job.id)).toMatchObject({
          status: 'FAILED',
          totalRows: 251,
          importedRows: 250,
          validRows: 1,
        });
        expect(
          await client.voter.count({ where: { tenantId: user.tenantId } }),
        ).toBe(250);
        expect(
          await client.consentRecord.count({
            where: { tenantId: user.tenantId },
          }),
        ).toBe(250);
      } finally {
        await pool.query(
          'DROP TRIGGER "qa_person_import_partial" ON "ConsentRecord"; DROP FUNCTION "qa_person_import_partial"()',
        );
      }
      await service.retry(user, job.id);
      await service.process(job.id, user.tenantId);
      expect(await service.get(user, job.id)).toMatchObject({
        status: 'COMPLETED',
        importedRows: 251,
        validRows: 0,
      });
      expect(
        await client.voter.count({ where: { tenantId: user.tenantId } }),
      ).toBe(251);
      expect(
        await client.consentRecord.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBe(251);
    });
  },
);
