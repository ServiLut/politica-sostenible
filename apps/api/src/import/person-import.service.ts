import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  AuditActorType,
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  PersonImportJob,
  PersonImportRowStatus,
  PersonImportStatus,
  PoliticalOperationMode,
  Prisma,
  StorageIntegrityStatus,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertPlanQuotaInTransaction,
  getTenantEntitledSubscription,
} from '../auth/guards/plan-limits.guard';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { lockAndAssertOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import { normalizePhoneInput } from '../common/utils/phone-normalization.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePersonImportDto,
  PersonImportPageDto,
} from './dto/person-import.dto';
import {
  ImportService,
  ParsedCsvRow,
  REQUIRED_HEADERS,
} from './import.service';
import { PersonImportArtifactService } from './person-import-artifact.service';
import { personCsvRows, safeCsvCell } from './person-import-csv';
import {
  PERSON_IMPORT_BATCH,
  PERSON_IMPORT_LEASE_MS,
  PERSON_IMPORT_MAX_BYTES,
  PERSON_IMPORT_MAX_ROWS,
  PERSON_IMPORT_QUEUE_PORT,
  type PersonImportQueuePort,
} from './person-import.constants';

const OPTIONAL_HEADERS = ['Teléfono', 'Correo', 'Puesto', 'Mesa'];
const SELECT = {
  id: true,
  fileName: true,
  status: true,
  totalRows: true,
  validRows: true,
  errorRows: true,
  skippedRows: true,
  importedRows: true,
  attempts: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  importRequestedAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
} satisfies Prisma.PersonImportJobSelect;
type JobView = Prisma.PersonImportJobGetPayload<{ select: typeof SELECT }>;
type ErrorDetail = { field: string; message: string };

@Injectable()
export class PersonImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legacy: ImportService,
    private readonly artifacts: PersonImportArtifactService,
    @Inject(PERSON_IMPORT_QUEUE_PORT)
    private readonly queue: PersonImportQueuePort,
  ) {}

  private async authorize(
    user: AuthenticatedUser,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const context = await this.legacy.loadImportContext(tx, user);
    const subscription = await getTenantEntitledSubscription(tx, user.tenantId);
    if (!subscription.plan.includesImport)
      throw new ForbiddenException('El plan no habilita importaciones');
    return context;
  }

  async options(user: AuthenticatedUser) {
    const context = await this.authorize(user);
    const limits = await this.artifacts.uploadLimits();
    return {
      limits: {
        maxRows: PERSON_IMPORT_MAX_ROWS,
        ...limits,
      },
      notice: {
        version: context.noticeVersion,
        activatedAt: context.noticeActivatedAt,
      },
      requiredHeaders: REQUIRED_HEADERS,
      optionalHeaders: OPTIONAL_HEADERS,
    };
  }

  async create(user: AuthenticatedUser, dto: CreatePersonImportDto) {
    if (!dto.sourceArtifactPath.startsWith(`${user.tenantId}/person-import/`))
      throw new BadRequestException('El CSV no pertenece a la organización');
    const payloadSha256 = createHash('sha256')
      .update(
        JSON.stringify({
          fileName: dto.fileName,
          path: dto.sourceArtifactPath,
          hash: dto.expectedContentSha256,
        }),
      )
      .digest('hex');
    const job = await this.prisma.$transaction(async (tx) => {
      await lockAndAssertOperationOpen(tx, user.tenantId);
      const context = await this.authorize(user, tx);
      const existing = await tx.personImportJob.findFirst({
        where: {
          tenantId: user.tenantId,
          OR: [
            { clientRequestId: dto.clientRequestId },
            { sourceArtifactPath: dto.sourceArtifactPath },
          ],
        },
      });
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256)
          throw new ConflictException(
            'La solicitud o el archivo ya están asociados a otro contenido',
          );
        return existing;
      }
      await this.assertActiveJobCapacity(tx, user.tenantId);
      const stored = await tx.storedObject.findFirst({
        where: {
          tenantId: user.tenantId,
          path: dto.sourceArtifactPath,
          uploaderId: user.userId,
          module: StorageObjectModule.PERSON_IMPORT,
          status: StoredObjectStatus.CONFIRMED,
          consumedAt: null,
          integrityStatus: StorageIntegrityStatus.VERIFIED,
          calculatedSha256: dto.expectedContentSha256,
        },
        select: { contentType: true, actualSize: true, expectedSize: true },
      });
      if (
        !stored ||
        stored.contentType !== 'text/csv' ||
        !stored.actualSize ||
        stored.actualSize !== stored.expectedSize ||
        stored.actualSize > PERSON_IMPORT_MAX_BYTES
      )
        throw new BadRequestException(
          'El CSV debe estar confirmado y sus bytes verificados, dentro de 20 MiB',
        );
      const created = await tx.personImportJob.create({
        data: {
          tenantId: user.tenantId,
          requestedById: user.userId,
          ...dto,
          payloadSha256,
          noticeVersion: context.noticeVersion,
        },
      });
      await consumeConfirmedStorageUpload(
        tx,
        user.tenantId,
        dto.sourceArtifactPath,
        StorageObjectModule.PERSON_IMPORT,
        'PersonImportJob',
        created.id,
        user.userId,
        { expectedSha256: dto.expectedContentSha256 },
      );
      await this.audit(tx, created, 'PERSON_IMPORT_REQUESTED');
      return created;
    });
    if (
      job.status === PersonImportStatus.QUEUED ||
      job.status === PersonImportStatus.IMPORT_QUEUED
    )
      await this.queue.enqueue({
        importJobId: job.id,
        tenantId: user.tenantId,
      });
    return this.view(job);
  }

  async list(user: AuthenticatedUser, query: PersonImportPageDto) {
    await this.authorize(user);
    const where = { tenantId: user.tenantId };
    const [items, total] = await Promise.all([
      this.prisma.personImportJob.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.personImportJob.count({ where }),
    ]);
    return {
      items: items.map((job) => this.view(job)),
      pagination: this.pagination(query, total),
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    await this.authorize(user);
    return this.view(await this.find(user.tenantId, id));
  }

  async execute(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.$transaction(async (tx) => {
      await lockAndAssertOperationOpen(tx, user.tenantId);
      const context = await this.authorize(user, tx);
      const current = await tx.personImportJob.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!current) throw new NotFoundException('Importación no encontrada');
      if (current.importRequestedAt) return current;
      if (
        current.status !== PersonImportStatus.READY ||
        current.validRows === 0
      )
        throw new ConflictException(
          'No hay filas válidas revisadas para importar',
        );
      if (context.noticeVersion !== current.noticeVersion)
        throw new ConflictException(
          'Cambió el aviso de privacidad; revise un archivo nuevo',
        );
      await assertPlanQuotaInTransaction(
        tx,
        user.tenantId,
        'voters',
        current.validRows,
      );
      await this.assertActiveJobCapacity(tx, user.tenantId);
      const updated = await tx.personImportJob.update({
        where: { id_tenantId: { id, tenantId: user.tenantId } },
        data: {
          status: PersonImportStatus.IMPORT_QUEUED,
          importRequestedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        updated,
        'PERSON_IMPORT_EXECUTION_REQUESTED',
        user.userId,
      );
      return updated;
    });
    if (job.status === PersonImportStatus.IMPORT_QUEUED)
      await this.queue.enqueue({ importJobId: id, tenantId: user.tenantId });
    return this.view(job);
  }

  async retry(user: AuthenticatedUser, id: string) {
    await this.authorize(user);
    const job = await this.prisma.$transaction(async (tx) => {
      await lockAndAssertOperationOpen(tx, user.tenantId);
      await this.authorize(user, tx);
      const current = await tx.personImportJob.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!current) throw new NotFoundException('Importación no encontrada');
      if (
        current.status !== PersonImportStatus.FAILED ||
        current.lastErrorCode === 'INVALID_FILE'
      )
        throw new ConflictException(
          'Este trabajo no permite reintento; corrija el archivo o espere su resultado',
        );
      await this.assertActiveJobCapacity(tx, user.tenantId);
      return tx.personImportJob.update({
        where: { id_tenantId: { id, tenantId: user.tenantId } },
        data: {
          status: current.importRequestedAt
            ? PersonImportStatus.IMPORT_QUEUED
            : PersonImportStatus.QUEUED,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    });
    await this.queue.enqueue({ importJobId: id, tenantId: user.tenantId });
    return this.view(job);
  }

  async errors(
    user: AuthenticatedUser,
    id: string,
    query: PersonImportPageDto,
  ) {
    await this.authorize(user);
    await this.find(user.tenantId, id);
    const where = {
      tenantId: user.tenantId,
      jobId: id,
      status: PersonImportRowStatus.INVALID,
    };
    const [items, total] = await Promise.all([
      this.prisma.personImportRowResult.findMany({
        where,
        select: { rowNumber: true, errors: true },
        orderBy: { rowNumber: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.personImportRowResult.count({ where }),
    ]);
    return {
      items: items.map((row) => ({ row: row.rowNumber, errors: row.errors })),
      pagination: this.pagination(query, total),
    };
  }

  async *errorCsv(user: AuthenticatedUser, id: string) {
    await this.authorize(user);
    const job = await this.find(user.tenantId, id);
    await this.audit(
      this.prisma,
      job,
      'PERSON_IMPORT_ERRORS_EXPORTED',
      user.userId,
    );
    const headers = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];
    yield '\uFEFF' +
      [...headers, 'Fila', 'Motivo'].map(safeCsvCell).join(',') +
      '\r\n';
    let after = 0;
    while (true) {
      // Revalidate current permissions on each page; never retain a giant CSV in API RAM.
      await this.authorize(user);
      const rows = await this.prisma.personImportRowResult.findMany({
        where: {
          tenantId: user.tenantId,
          jobId: id,
          status: PersonImportRowStatus.INVALID,
          rowNumber: { gt: after },
        },
        orderBy: { rowNumber: 'asc' },
        take: PERSON_IMPORT_BATCH,
      });
      if (!rows.length) break;
      for (const row of rows) {
        const fields = this.fields(row.values);
        const errors = row.errors as unknown as ErrorDetail[];
        yield [
          ...headers.map((h) => fields[h] ?? ''),
          String(row.rowNumber),
          errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
        ]
          .map(safeCsvCell)
          .join(',') + '\r\n';
      }
      after = rows[rows.length - 1].rowNumber;
    }
  }

  async process(id: string, tenantId: string): Promise<void> {
    const token = randomUUID();
    const now = new Date();
    const claim = await this.prisma.personImportJob.updateMany({
      where: {
        id,
        tenantId,
        AND: [{ OR: [{ leaseToken: null }, { leaseExpiresAt: { lt: now } }] }],
        OR: [
          {
            status: {
              in: [PersonImportStatus.QUEUED, PersonImportStatus.IMPORT_QUEUED],
            },
          },
          {
            status: {
              in: [PersonImportStatus.VALIDATING, PersonImportStatus.IMPORTING],
            },
            leaseExpiresAt: { lt: now },
          },
        ],
      },
      data: {
        leaseToken: token,
        leaseExpiresAt: new Date(now.getTime() + PERSON_IMPORT_LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) return;
    const job = await this.find(tenantId, id);
    const user = { userId: job.requestedById, tenantId };
    try {
      const context = await this.authorize(user);
      if (context.noticeVersion !== job.noticeVersion)
        throw new ForbiddenException(
          'Cambió el aviso de privacidad; genere una nueva revisión',
        );
      if (job.importRequestedAt) await this.importBatches(job, user, token);
      else await this.validate(job, user, token);
    } catch (error: unknown) {
      const code =
        error instanceof BadRequestException
          ? 'INVALID_FILE'
          : error instanceof ForbiddenException
            ? 'AUTHORIZATION_OR_QUOTA'
            : 'PROCESSING_INTERRUPTED';
      const message =
        error instanceof HttpException && error.getStatus() < 500
          ? error.message.slice(0, 500)
          : 'El procesamiento se interrumpió. Puede reintentarlo sin repetir las filas ya guardadas.';
      await this.prisma.personImportJob.updateMany({
        where: { id, tenantId, leaseToken: token },
        data: {
          status: PersonImportStatus.FAILED,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: code,
          lastErrorMessage: message,
        },
      });
      // Durable FAILED is explicit. User retry is required, never an uncontrolled insert loop.
    }
  }

  private async validate(
    job: PersonImportJob,
    user: AuthenticatedUser,
    token: string,
  ) {
    await this.prisma.personImportJob.updateMany({
      where: { tenantId: job.tenantId, id: job.id, leaseToken: token },
      data: { status: PersonImportStatus.VALIDATING },
    });
    const source = await this.prisma.storedObject.findFirst({
      where: {
        tenantId: job.tenantId,
        path: job.sourceArtifactPath,
        consumedById: job.id,
        consumedByType: 'PersonImportJob',
        status: StoredObjectStatus.CONSUMED,
      },
      select: { actualSize: true },
    });
    if (!source?.actualSize)
      throw new BadRequestException(
        'No existe el CSV asociado a la importación',
      );
    await this.artifacts.withVerifiedCsv(
      job.sourceArtifactPath,
      source.actualSize,
      job.expectedContentSha256,
      async (bytes) => {
        let batch: ParsedCsvRow[] = [];
        for await (const row of personCsvRows(bytes)) {
          if (row.lineNumber <= job.validatedThrough) continue;
          batch.push(row);
          if (batch.length === PERSON_IMPORT_BATCH) {
            await this.stage(job, user, token, batch);
            batch = [];
          }
        }
        if (batch.length) await this.stage(job, user, token, batch);
      },
    );
    await this.prisma.$transaction(
      async (tx) => {
        await this.fence(tx, job, user, token);
        // Duplicate detection spans the whole source, not only the current batch.
        for (const field of ['documentId', 'proofPath'] as const) {
          const column =
            field === 'documentId'
              ? Prisma.sql`"documentId"`
              : Prisma.sql`"proofPath"`;
          const errorField =
            field === 'documentId' ? 'Documento' : 'Ruta evidencia';
          const localDuplicateMessage =
            field === 'documentId'
              ? 'El documento aparece más de una vez en el archivo; conserve una sola fila verificable'
              : 'Cada persona debe tener una evidencia única y no reutilizada';
          const duplicateMessage =
            'El valor está repetido en el archivo. Conserve una fila y una evidencia por persona.';
          const errors = JSON.stringify([
            {
              field: errorField,
              message: duplicateMessage,
            },
          ]);
          await tx.$executeRaw(
            Prisma.sql`UPDATE "PersonImportRowResult" r SET "status"='INVALID', "errors"=(SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(r."errors") e WHERE NOT (e->>'field'=${errorField} AND e->>'message' IN (${localDuplicateMessage},${duplicateMessage}))) || ${errors}::jsonb FROM (SELECT ${column} AS value FROM "PersonImportRowResult" WHERE "tenant_id"=${job.tenantId} AND "jobId"=${job.id} AND ${column} IS NOT NULL GROUP BY ${column} HAVING count(*)>1) duplicates WHERE r."tenant_id"=${job.tenantId} AND r."jobId"=${job.id} AND r.${column}=duplicates.value`,
          );
        }
        await this.recount(tx, job, {
          status: PersonImportStatus.READY,
          leaseToken: null,
          leaseExpiresAt: null,
        });
        await this.audit(tx, job, 'PERSON_IMPORT_VALIDATED');
      },
      { timeout: 30_000 },
    );
  }

  private async stage(
    job: PersonImportJob,
    user: AuthenticatedUser,
    token: string,
    rows: ParsedCsvRow[],
  ) {
    const context = await this.authorize(user);
    const validation = await this.legacy.validateVoters(
      rows,
      job.tenantId,
      context,
    );
    const freshDocuments = new Set(
      validation.preview
        .filter((r) => r.status === 'new')
        .map((r) => r.documentId),
    );
    const proofRows = rows.filter((r) =>
      freshDocuments.has(r.fields.Documento),
    );
    const proofObjects = await this.prisma.storedObject.findMany({
      where: {
        tenantId: job.tenantId,
        path: { in: proofRows.map((r) => r.fields['Ruta evidencia']) },
        module: StorageObjectModule.CONSENT,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      select: {
        path: true,
        expectedSha256: true,
        reportedSha256: true,
        calculatedSha256: true,
        integrityStatus: true,
      },
    });
    const available = new Set(
      proofObjects
        .filter((p) => this.proofIntegrityValid(p))
        .map((p) => p.path),
    );
    const evidence = proofRows
      .filter((r) => !available.has(r.fields['Ruta evidencia']))
      .map((r) => ({
        row: r.lineNumber,
        field: 'Ruta evidencia',
        message:
          'La evidencia no está confirmada, ya fue utilizada o su integridad no está verificada',
      }));
    const errors = [...validation.errorRows, ...evidence];
    const existing = new Set(
      validation.preview
        .filter((r) => r.status === 'duplicate_db')
        .map((r) => r.documentId),
    );
    await this.prisma.$transaction(
      async (tx) => {
        await this.fence(tx, job, user, token);
        const staged = await tx.personImportRowResult.createManyAndReturn({
          data: rows.map((row) => {
            const rowErrors = errors
              .filter((e) => e.row === row.lineNumber)
              .map(({ field, message }) => ({ field, message }));
            return {
              tenantId: job.tenantId,
              jobId: job.id,
              rowNumber: row.lineNumber,
              documentId: row.fields.Documento?.slice(0, 100) || null,
              proofPath: row.fields['Ruta evidencia']?.slice(0, 512) || null,
              values: row.fields,
              errors: rowErrors,
              status: rowErrors.length
                ? PersonImportRowStatus.INVALID
                : existing.has(row.fields.Documento)
                  ? PersonImportRowStatus.SKIPPED
                  : PersonImportRowStatus.READY,
            };
          }),
          skipDuplicates: true,
          select: { status: true },
        });
        await tx.personImportJob.updateMany({
          where: { tenantId: job.tenantId, id: job.id },
          data: {
            validatedThrough: rows[rows.length - 1].lineNumber,
            totalRows: { increment: staged.length },
            validRows: {
              increment: staged.filter(
                (r) => r.status === PersonImportRowStatus.READY,
              ).length,
            },
            errorRows: {
              increment: staged.filter(
                (r) => r.status === PersonImportRowStatus.INVALID,
              ).length,
            },
            skippedRows: {
              increment: staged.filter(
                (r) => r.status === PersonImportRowStatus.SKIPPED,
              ).length,
            },
          },
        });
      },
      { timeout: 30_000 },
    );
  }

  private async importBatches(
    job: PersonImportJob,
    user: AuthenticatedUser,
    token: string,
  ) {
    while (true) {
      const count = await this.prisma.$transaction(
        async (tx) => {
          await this.fence(tx, job, user, token);
          const rows = await tx.personImportRowResult.findMany({
            where: {
              tenantId: job.tenantId,
              jobId: job.id,
              status: PersonImportRowStatus.READY,
            },
            orderBy: { rowNumber: 'asc' },
            take: PERSON_IMPORT_BATCH,
          });
          if (!rows.length) {
            await this.recount(tx, job, {
              status: PersonImportStatus.COMPLETED,
              completedAt: new Date(),
              leaseToken: null,
              leaseExpiresAt: null,
            });
            await this.audit(tx, job, 'PERSON_IMPORT_COMPLETED');
            return 0;
          }
          const existing = new Set(
            (
              await tx.voter.findMany({
                where: {
                  tenantId: job.tenantId,
                  documentId: { in: rows.map((r) => r.documentId ?? '') },
                },
                select: { documentId: true },
              })
            ).map((r) => r.documentId),
          );
          const candidates = rows.filter(
            (r) => !existing.has(r.documentId ?? ''),
          );
          const proofs = await tx.storedObject.findMany({
            where: {
              tenantId: job.tenantId,
              path: { in: candidates.map((r) => r.proofPath ?? '') },
              module: StorageObjectModule.CONSENT,
              status: StoredObjectStatus.CONFIRMED,
              consumedAt: null,
            },
            select: {
              path: true,
              expectedSha256: true,
              reportedSha256: true,
              calculatedSha256: true,
              integrityStatus: true,
            },
          });
          const available = new Set(
            proofs
              .filter((p) => this.proofIntegrityValid(p))
              .map((p) => p.path),
          );
          const hasPuestos = rows.some((row) => this.fields(row.values).Puesto);
          const puestos = hasPuestos
            ? await tx.politicalDivision.findMany({
                where: {
                  tenantId: job.tenantId,
                  type: DivisionType.PUESTO,
                  isActive: true,
                },
                select: { id: true, name: true, code: true },
              })
            : [];
          const puestosByCode = new Map(puestos.map((p) => [p.code, p]));
          const puestosByName = new Map<string, typeof puestos>();
          for (const puesto of puestos) {
            const key = puesto.name
              .normalize('NFKC')
              .toLocaleLowerCase('es-CO');
            const values = puestosByName.get(key) ?? [];
            values.push(puesto);
            puestosByName.set(key, values);
          }
          const accepted: Array<{
            rowId: string;
            documentId: string;
            proof: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            email: string | null;
            puestoId: string | null;
            mesa: number | null;
            grantedAt: Date;
          }> = [];
          const updates: Array<{
            id: string;
            status: PersonImportRowStatus;
            voterId: string | null;
            errors: ErrorDetail[];
          }> = [];
          for (const row of rows) {
            if (existing.has(row.documentId ?? '')) {
              updates.push({
                id: row.id,
                status: PersonImportRowStatus.SKIPPED,
                voterId: null,
                errors: [],
              });
              continue;
            }
            const values = this.fields(row.values);
            const puestoValue = values.Puesto ?? '';
            const matches =
              puestosByName.get(
                puestoValue.normalize('NFKC').toLocaleLowerCase('es-CO'),
              ) ?? [];
            const puesto =
              puestosByCode.get(puestoValue) ??
              (matches.length === 1 ? matches[0] : undefined);
            const failures: ErrorDetail[] = [];
            if (!available.has(row.proofPath ?? ''))
              failures.push({
                field: 'Ruta evidencia',
                message:
                  'La evidencia fue utilizada o dejó de estar disponible desde la revisión',
              });
            if (puestoValue && !puesto)
              failures.push({
                field: 'Puesto',
                message:
                  'El puesto cambió o ya no identifica un único puesto activo',
              });
            if (failures.length) {
              updates.push({
                id: row.id,
                status: PersonImportRowStatus.INVALID,
                voterId: null,
                errors: failures,
              });
              continue;
            }
            const phone = normalizePhoneInput(values['Teléfono'] ?? '');
            accepted.push({
              rowId: row.id,
              documentId: values.Documento,
              firstName: values.Nombre,
              lastName: values.Apellido,
              proof: row.proofPath!,
              phone: typeof phone === 'string' && phone ? phone : null,
              email: values.Correo?.toLowerCase() || null,
              puestoId: puesto?.id ?? null,
              mesa: values.Mesa ? Number(values.Mesa) : null,
              grantedAt: new Date(values['Fecha consentimiento']),
            });
          }
          await assertPlanQuotaInTransaction(
            tx,
            job.tenantId,
            'voters',
            accepted.length,
          );
          const voters = accepted.length
            ? await tx.voter.createManyAndReturn({
                data: accepted.map((r) => ({
                  tenantId: job.tenantId,
                  registrarId: user.userId,
                  documentId: r.documentId,
                  firstName: r.firstName,
                  lastName: r.lastName,
                  phone: r.phone,
                  email: r.email,
                  puestoId: r.puestoId,
                  mesa: r.mesa,
                  consentAccepted: true,
                  consentTimestamp: r.grantedAt,
                  termsVersion: job.noticeVersion,
                })),
                skipDuplicates: true,
                select: { id: true, documentId: true },
              })
            : [];
          const byDocument = new Map(voters.map((v) => [v.documentId, v.id]));
          const created = accepted.filter((r) => byDocument.has(r.documentId));
          if (created.length) {
            const links = Prisma.join(
              created.map(
                (r) =>
                  Prisma.sql`(${r.proof},${byDocument.get(r.documentId)!})`,
              ),
            );
            const consumed = await tx.$executeRaw(
              Prisma.sql`UPDATE "StoredObject" s SET "status"='CONSUMED', "consumedAt"=NOW(), "consumedByType"='VoterConsent', "consumedById"=v.id, "updatedAt"=NOW() FROM (VALUES ${links}) v(path,id) WHERE s."tenantId"=${job.tenantId} AND s."path"=v.path AND s."module"='CONSENT' AND s."status"='CONFIRMED' AND s."consumedAt" IS NULL AND ((s."expectedSha256" IS NULL AND s."reportedSha256" IS NULL) OR (s."expectedSha256" IS NOT NULL AND s."expectedSha256"=s."reportedSha256" AND s."expectedSha256"=s."calculatedSha256" AND s."integrityStatus"='VERIFIED'))`,
            );
            if (consumed !== created.length)
              throw new ConflictException(
                'Una evidencia cambió durante el lote; el lote no se guardó',
              );
            await tx.consentRecord.createMany({
              data: created.map((r) => ({
                tenantId: job.tenantId,
                mode: PoliticalOperationMode.CAMPAIGN,
                subjectType: ConsentSubjectType.VOTER,
                subjectRef: byDocument.get(r.documentId)!,
                voterId: byDocument.get(r.documentId)!,
                purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
                legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
                status: ConsentStatus.GRANTED,
                collectionChannel: ConsentCollectionChannel.IMPORT,
                noticeVersion: job.noticeVersion,
                proofPath: r.proof,
                capturedById: user.userId,
                grantedAt: r.grantedAt,
              })),
            });
          }
          for (const row of accepted)
            updates.push({
              id: row.rowId,
              status: byDocument.has(row.documentId)
                ? PersonImportRowStatus.IMPORTED
                : PersonImportRowStatus.SKIPPED,
              voterId: byDocument.get(row.documentId) ?? null,
              errors: [],
            });
          if (updates.length) {
            const values = Prisma.join(
              updates.map(
                (r) =>
                  Prisma.sql`(${r.id},${r.status}::"PersonImportRowStatus",${r.voterId}::text,${JSON.stringify(r.errors)}::jsonb)`,
              ),
            );
            await tx.$executeRaw(
              Prisma.sql`UPDATE "PersonImportRowResult" r SET "status"=v.status, "voterId"=v.voter_id, "errors"=v.errors FROM (VALUES ${values}) v(id,status,voter_id,errors) WHERE r."tenant_id"=${job.tenantId} AND r."jobId"=${job.id} AND r.id=v.id`,
            );
          }
          await tx.personImportJob.updateMany({
            where: { tenantId: job.tenantId, id: job.id },
            data: {
              status: PersonImportStatus.IMPORTING,
              validRows: { decrement: rows.length },
              importedRows: {
                increment: updates.filter(
                  (r) => r.status === PersonImportRowStatus.IMPORTED,
                ).length,
              },
              errorRows: {
                increment: updates.filter(
                  (r) => r.status === PersonImportRowStatus.INVALID,
                ).length,
              },
              skippedRows: {
                increment: updates.filter(
                  (r) => r.status === PersonImportRowStatus.SKIPPED,
                ).length,
              },
            },
          });
          await this.audit(
            tx,
            job,
            'PERSON_IMPORT_BATCH_COMMITTED',
            user.userId,
            { imported: created.length, examined: rows.length },
          );
          return rows.length;
        },
        { timeout: 30_000 },
      );
      if (!count) break;
    }
  }

  private async fence(
    tx: Prisma.TransactionClient,
    job: PersonImportJob,
    user: AuthenticatedUser,
    token: string,
  ) {
    await lockAndAssertOperationOpen(tx, job.tenantId);
    const context = await this.authorize(user, tx);
    if (context.noticeVersion !== job.noticeVersion)
      throw new ForbiddenException(
        'Cambió el aviso de privacidad; genere una nueva revisión',
      );
    const renewed = await tx.personImportJob.updateMany({
      where: {
        tenantId: job.tenantId,
        id: job.id,
        leaseToken: token,
        leaseExpiresAt: { gt: new Date() },
      },
      data: { leaseExpiresAt: new Date(Date.now() + PERSON_IMPORT_LEASE_MS) },
    });
    if (!renewed.count)
      throw new ConflictException(
        'El procesamiento cambió de ejecutor; este lote no se guardó',
      );
  }

  private async recount(
    tx: Prisma.TransactionClient,
    job: PersonImportJob,
    data: Prisma.PersonImportJobUpdateManyMutationInput,
  ) {
    const groups = await tx.personImportRowResult.groupBy({
      by: ['status'],
      where: { tenantId: job.tenantId, jobId: job.id },
      _count: { _all: true },
    });
    const count = (status: PersonImportRowStatus) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;
    await tx.personImportJob.updateMany({
      where: { tenantId: job.tenantId, id: job.id },
      data: {
        ...data,
        totalRows: groups.reduce((sum, g) => sum + g._count._all, 0),
        validRows: count(PersonImportRowStatus.READY),
        errorRows: count(PersonImportRowStatus.INVALID),
        skippedRows: count(PersonImportRowStatus.SKIPPED),
        importedRows: count(PersonImportRowStatus.IMPORTED),
      },
    });
  }

  private async find(tenantId: string, id: string) {
    const job = await this.prisma.personImportJob.findFirst({
      where: { tenantId, id },
    });
    if (!job) throw new NotFoundException('Importación no encontrada');
    return job;
  }

  private async assertActiveJobCapacity(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const active = await tx.personImportJob.count({
      where: {
        tenantId,
        status: {
          in: [
            PersonImportStatus.QUEUED,
            PersonImportStatus.VALIDATING,
            PersonImportStatus.IMPORT_QUEUED,
            PersonImportStatus.IMPORTING,
          ],
        },
      },
    });
    if (active >= 2)
      throw new ConflictException(
        'Ya hay dos importaciones en proceso en su organización. Espere a que termine una antes de iniciar otra.',
      );
  }

  private view(job: JobView) {
    const { importRequestedAt, ...publicJob } = job;
    // Explicit fields prevent private source paths, requester, hash and lease leaks.
    return {
      id: publicJob.id,
      fileName: publicJob.fileName,
      status: publicJob.status,
      totalRows: publicJob.totalRows,
      validRows: publicJob.validRows,
      errorRows: publicJob.errorRows,
      skippedRows: publicJob.skippedRows,
      importedRows: publicJob.importedRows,
      attempts: publicJob.attempts,
      createdAt: publicJob.createdAt,
      updatedAt: publicJob.updatedAt,
      completedAt: publicJob.completedAt,
      lastErrorCode: publicJob.lastErrorCode,
      lastErrorMessage: publicJob.lastErrorMessage,
      canExecute: job.status === PersonImportStatus.READY && job.validRows > 0,
      canRetry:
        job.status === PersonImportStatus.FAILED &&
        job.lastErrorCode !== 'INVALID_FILE',
      progress: {
        phase:
          job.status === PersonImportStatus.COMPLETED
            ? 'complete'
            : importRequestedAt
              ? 'import'
              : 'validation',
        processed: importRequestedAt
          ? job.totalRows - job.validRows
          : job.totalRows,
        total:
          job.status === PersonImportStatus.QUEUED ||
          job.status === PersonImportStatus.VALIDATING
            ? null
            : job.totalRows,
      },
    };
  }

  private proofIntegrityValid(proof: {
    expectedSha256: string | null;
    reportedSha256: string | null;
    calculatedSha256: string | null;
    integrityStatus: StorageIntegrityStatus;
  }) {
    return (
      (!proof.expectedSha256 && !proof.reportedSha256) ||
      (proof.expectedSha256 !== null &&
        proof.integrityStatus === StorageIntegrityStatus.VERIFIED &&
        proof.expectedSha256 === proof.reportedSha256 &&
        proof.expectedSha256 === proof.calculatedSha256)
    );
  }

  private fields(value: Prisma.JsonValue): Record<string, string> {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.values(value).some((v) => typeof v !== 'string')
    )
      throw new BadRequestException('Fila almacenada inválida');
    return value as Record<string, string>;
  }

  private pagination(query: PersonImportPageDto, total: number) {
    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  private audit(
    tx: Pick<Prisma.TransactionClient, 'auditEvent'>,
    job: Pick<PersonImportJob, 'id' | 'tenantId' | 'requestedById'>,
    action: string,
    actorId = job.requestedById,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.auditEvent.create({
      data: {
        tenantId: job.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: actorId,
        action,
        resourceType: 'PersonImportJob',
        resourceId: job.id,
        metadata,
      },
    });
  }
}
