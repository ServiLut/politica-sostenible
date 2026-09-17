import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ConsentPurpose,
  ConsentSubjectType,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertCampaignTenant } from '../common/utils/campaign-mode.util';
import {
  CONSENT_EFFECTIVENESS_RECORD_SELECT,
  evaluateConsentEffectiveness,
} from '../common/utils/consent-effectiveness.util';
import { findActiveConsentNotice } from '../common/utils/consent-notice.util';
import {
  buildCsvRow,
  type CsvCellValue,
} from '../common/utils/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportModule } from './dto/export-module-params.dto';

const EXPORT_BATCH_SIZE = 250;

interface ExportContext {
  readonly moduleName: ExportModule;
  readonly tenantId: string;
  readonly mode: PoliticalOperationMode;
  readonly actorUserId: string;
  readonly watermark: string;
  readonly headers: readonly string[];
}

export interface OpenedExport {
  readonly fileName: string;
  readonly chunks: AsyncGenerator<Buffer | string>;
}

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async openExport(
    moduleName: ExportModule,
    user: AuthenticatedUser,
    signal?: AbortSignal,
  ): Promise<OpenedExport> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, defaultMode: true, type: true },
    });

    if (!tenant) {
      throw new BadRequestException('Organización no encontrada');
    }

    if (moduleName === 'personas') {
      assertCampaignTenant(tenant);
    }

    if (moduleName === 'equipo' && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Solo un administrador puede exportar los datos del equipo',
      );
    }

    const headers = this.headersFor(moduleName);
    const actor = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { name: true },
    });
    const date = new Date().toISOString().split('T')[0];
    const actorName = actor?.name ?? 'Usuario';
    const actorEmail = user.email ?? 'Sin correo';
    const context: ExportContext = {
      moduleName,
      tenantId: user.tenantId,
      mode: tenant.defaultMode,
      actorUserId: user.userId,
      watermark: `Exportado por ${actorName} (${actorEmail}) el ${date} — Organización: ${tenant.name} — Datos confidenciales`,
      headers,
    };

    return {
      fileName: `export-${moduleName}-${date}.csv`,
      chunks: this.generateCsv(context, signal),
    };
  }

  private async *generateCsv(
    context: ExportContext,
    signal?: AbortSignal,
  ): AsyncGenerator<Buffer | string> {
    signal?.throwIfAborted();
    yield Buffer.from('\uFEFF', 'utf8');
    yield `${buildCsvRow([context.watermark])}\n`;
    yield `${buildCsvRow(context.headers)}\n`;

    for await (const row of this.rowsFor(context, signal)) {
      signal?.throwIfAborted();
      yield `${buildCsvRow(row)}\n`;
    }

    signal?.throwIfAborted();
    await this.prisma.auditEvent.create({
      data: {
        tenantId: context.tenantId,
        mode: context.mode,
        actorType: 'USER',
        actorUserId: context.actorUserId,
        action: 'DATA_EXPORTED',
        resourceType: context.moduleName,
        resourceId: 'ALL',
      },
    });
  }

  private async *rowsFor(
    context: ExportContext,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    switch (context.moduleName) {
      case 'personas':
        yield* this.exportVoters(context.tenantId, signal);
        return;
      case 'tareas':
        yield* this.exportTasks(context.tenantId, context.mode, signal);
        return;
      case 'casos':
        yield* this.exportCases(context.tenantId, context.mode, signal);
        return;
      case 'compromisos':
        yield* this.exportCommitments(context.tenantId, context.mode, signal);
        return;
      case 'eventos':
        yield* this.exportEvents(context.tenantId, context.mode, signal);
        return;
      case 'equipo':
        yield* this.exportUsers(context.tenantId, signal);
        return;
      default:
        throw new BadRequestException(
          `Módulo no soportado para exportación: ${String(context.moduleName)}`,
        );
    }
  }

  private headersFor(moduleName: ExportModule): readonly string[] {
    switch (moduleName) {
      case 'personas':
        return [
          'Documento',
          'Nombre',
          'Apellido',
          'Teléfono',
          'Correo',
          'Puesto',
          'Mesa',
          'Consentimiento',
          'Fecha de registro',
        ];
      case 'tareas':
        return [
          'Título',
          'Descripción',
          'Estado',
          'Prioridad',
          'Responsable',
          'Fecha límite',
          'Completada',
          'Creada',
        ];
      case 'casos':
        return [
          'Referencia',
          'Título',
          'Categoría',
          'Canal',
          'Estado',
          'Prioridad',
          'Responsable',
          'Persona vinculada',
          'Fecha límite',
          'Creado',
        ];
      case 'compromisos':
        return [
          'Referencia',
          'Título',
          'Estado',
          'Propietario',
          'Progreso (%)',
          'Fecha objetivo',
          'Público',
          'Completado',
          'Creado',
        ];
      case 'eventos':
        return [
          'Nombre',
          'Descripción',
          'Inicio',
          'Fin',
          'Ubicación',
          'Estado',
          'Capacidad',
          'Responsable',
          'Creado',
        ];
      case 'equipo':
        return [
          'Nombre',
          'Correo',
          'Rol',
          'Activo',
          'Territorio',
          'Fecha de ingreso',
        ];
      default:
        throw new BadRequestException(
          `Módulo no soportado para exportación: ${String(moduleName)}`,
        );
    }
  }

  private maskSensitiveValue(value: string): string {
    if (!value) return '';
    if (value.length <= 4) {
      return '*'.repeat(Math.max(value.length, 4));
    }
    return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
  }

  private maskEmail(value: string): string {
    const separator = value.lastIndexOf('@');
    if (separator <= 0 || separator === value.length - 1) {
      return this.maskSensitiveValue(value);
    }

    const local = value.slice(0, separator);
    const domain = value.slice(separator + 1);
    return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
  }

  private async *exportVoters(
    tenantId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    const checkedAt = new Date();
    const notice = await findActiveConsentNotice(
      this.prisma,
      tenantId,
      PoliticalOperationMode.CAMPAIGN,
      ConsentPurpose.POLITICAL_COMMUNICATION,
    );
    let cursor: string | undefined;

    while (true) {
      signal?.throwIfAborted();
      const voters = await this.prisma.voter.findMany({
        where: { tenantId },
        select: {
          id: true,
          documentId: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          mesa: true,
          createdAt: true,
          puesto: { select: { name: true } },
          consentRecords: {
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              subjectType: ConsentSubjectType.VOTER,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: CONSENT_EFFECTIVENESS_RECORD_SELECT,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const voter of voters) {
        const consentCurrent = evaluateConsentEffectiveness(
          voter.consentRecords[0] ?? null,
          notice?.version,
          checkedAt,
        ).active;
        yield [
          this.maskSensitiveValue(voter.documentId),
          voter.firstName,
          voter.lastName,
          voter.phone ? this.maskSensitiveValue(voter.phone) : '',
          voter.email ? this.maskEmail(voter.email) : '',
          voter.puesto?.name ?? '',
          voter.mesa?.toString() ?? '',
          consentCurrent ? 'Sí' : 'No',
          voter.createdAt.toISOString().split('T')[0],
        ];
      }

      if (voters.length < EXPORT_BATCH_SIZE) return;
      cursor = voters[voters.length - 1].id;
    }
  }

  private async *exportTasks(
    tenantId: string,
    mode: PoliticalOperationMode,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    let cursor: string | undefined;
    while (true) {
      signal?.throwIfAborted();
      const tasks = await this.prisma.task.findMany({
        where: { tenantId, mode },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueAt: true,
          completedAt: true,
          createdAt: true,
          assignee: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const task of tasks) {
        yield [
          task.title,
          task.description ?? '',
          task.status,
          task.priority,
          task.assignee?.name ?? 'Sin asignar',
          task.dueAt ? task.dueAt.toISOString().split('T')[0] : '',
          task.completedAt
            ? task.completedAt.toISOString().split('T')[0]
            : '',
          task.createdAt.toISOString().split('T')[0],
        ];
      }
      if (tasks.length < EXPORT_BATCH_SIZE) return;
      cursor = tasks[tasks.length - 1].id;
    }
  }

  private async *exportCases(
    tenantId: string,
    mode: PoliticalOperationMode,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    let cursor: string | undefined;
    while (true) {
      signal?.throwIfAborted();
      const cases = await this.prisma.issueCase.findMany({
        where: { tenantId, mode },
        select: {
          id: true,
          reference: true,
          title: true,
          category: true,
          sourceChannel: true,
          status: true,
          priority: true,
          externalContactRef: true,
          dueAt: true,
          createdAt: true,
          assignee: { select: { name: true } },
          voter: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const issueCase of cases) {
        yield [
          issueCase.reference,
          issueCase.title,
          issueCase.category,
          issueCase.sourceChannel ?? '',
          issueCase.status,
          issueCase.priority,
          issueCase.assignee?.name ?? 'Sin asignar',
          issueCase.voter
            ? `${issueCase.voter.firstName} ${issueCase.voter.lastName}`
            : (issueCase.externalContactRef ?? ''),
          issueCase.dueAt
            ? issueCase.dueAt.toISOString().split('T')[0]
            : '',
          issueCase.createdAt.toISOString().split('T')[0],
        ];
      }
      if (cases.length < EXPORT_BATCH_SIZE) return;
      cursor = cases[cases.length - 1].id;
    }
  }

  private async *exportCommitments(
    tenantId: string,
    mode: PoliticalOperationMode,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    let cursor: string | undefined;
    while (true) {
      signal?.throwIfAborted();
      const commitments = await this.prisma.commitment.findMany({
        where: { tenantId, mode },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          progress: true,
          targetDate: true,
          isPublic: true,
          completedAt: true,
          createdAt: true,
          owner: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const commitment of commitments) {
        yield [
          commitment.reference,
          commitment.title,
          commitment.status,
          commitment.owner?.name ?? 'Sin asignar',
          commitment.progress.toString(),
          commitment.targetDate
            ? commitment.targetDate.toISOString().split('T')[0]
            : '',
          commitment.isPublic ? 'Sí' : 'No',
          commitment.completedAt
            ? commitment.completedAt.toISOString().split('T')[0]
            : '',
          commitment.createdAt.toISOString().split('T')[0],
        ];
      }
      if (commitments.length < EXPORT_BATCH_SIZE) return;
      cursor = commitments[commitments.length - 1].id;
    }
  }

  private async *exportEvents(
    tenantId: string,
    mode: PoliticalOperationMode,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    let cursor: string | undefined;
    while (true) {
      signal?.throwIfAborted();
      const events = await this.prisma.campaignEvent.findMany({
        where: { tenantId, mode },
        select: {
          id: true,
          name: true,
          description: true,
          startsAt: true,
          endsAt: true,
          location: true,
          status: true,
          capacity: true,
          createdAt: true,
          responsible: { select: { name: true } },
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const event of events) {
        yield [
          event.name,
          event.description ?? '',
          event.startsAt.toISOString(),
          event.endsAt.toISOString(),
          event.location ?? '',
          event.status,
          event.capacity?.toString() ?? '',
          event.responsible?.name ?? 'Sin asignar',
          event.createdAt.toISOString().split('T')[0],
        ];
      }
      if (events.length < EXPORT_BATCH_SIZE) return;
      cursor = events[events.length - 1].id;
    }
  }

  private async *exportUsers(
    tenantId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly CsvCellValue[]> {
    let cursor: string | undefined;
    while (true) {
      signal?.throwIfAborted();
      const users = await this.prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          division: { select: { name: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const member of users) {
        yield [
          member.name,
          member.email,
          member.role,
          member.isActive ? 'Sí' : 'No',
          member.division?.name ?? 'Global',
          member.createdAt.toISOString().split('T')[0],
        ];
      }
      if (users.length < EXPORT_BATCH_SIZE) return;
      cursor = users[users.length - 1].id;
    }
  }
}
