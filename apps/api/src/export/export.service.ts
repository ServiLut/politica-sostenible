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
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { buildCsvRow } from '../common/utils/csv.util';
import { assertCampaignTenant } from '../common/utils/campaign-mode.util';
import {
  CONSENT_EFFECTIVENESS_RECORD_SELECT,
  evaluateConsentEffectiveness,
} from '../common/utils/consent-effectiveness.util';
import { findActiveConsentNotice } from '../common/utils/consent-notice.util';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async generateExport(
    moduleName: string,
    user: AuthenticatedUser,
  ): Promise<Buffer> {
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

    const actor = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { name: true },
    });
    const actorName = actor?.name ?? 'Usuario';
    const actorEmail = user.email ?? 'Sin correo';

    const date = new Date().toISOString().split('T')[0];
    const watermark = `Exportado por ${actorName} (${actorEmail}) el ${date} — Organización: ${tenant.name} — Datos confidenciales`;

    let headers: string[] = [];
    let rows: string[][] = [];

    switch (moduleName) {
      case 'personas':
        [headers, rows] = await this.exportVoters(user.tenantId);
        break;
      case 'tareas':
        [headers, rows] = await this.exportTasks(
          user.tenantId,
          tenant.defaultMode,
        );
        break;
      case 'casos':
        [headers, rows] = await this.exportCases(
          user.tenantId,
          tenant.defaultMode,
        );
        break;
      case 'compromisos':
        [headers, rows] = await this.exportCommitments(
          user.tenantId,
          tenant.defaultMode,
        );
        break;
      case 'eventos':
        [headers, rows] = await this.exportEvents(
          user.tenantId,
          tenant.defaultMode,
        );
        break;
      case 'equipo':
        [headers, rows] = await this.exportUsers(user.tenantId);
        break;
      default:
        throw new BadRequestException(
          `Módulo no soportado para exportación: ${moduleName}`,
        );
    }

    // Create AuditEvent
    await this.prisma.auditEvent.create({
      data: {
        tenantId: user.tenantId,
        mode: tenant.defaultMode,
        actorType: 'USER',
        actorUserId: user.userId,
        action: 'DATA_EXPORTED',
        resourceType: moduleName,
        resourceId: 'ALL',
      },
    });

    const csvLines = [
      buildCsvRow([watermark]),
      buildCsvRow(headers),
      ...rows.map((row) => buildCsvRow(row)),
    ];

    const csvString = csvLines.join('\n');
    const bom = Buffer.from('\uFEFF', 'utf-8');
    return Buffer.concat([bom, Buffer.from(csvString, 'utf-8')]);
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

  private async exportVoters(
    tenantId: string,
  ): Promise<[string[], string[][]]> {
    const checkedAt = new Date();
    const [notice, voters] = await Promise.all([
      findActiveConsentNotice(
        this.prisma,
        tenantId,
        PoliticalOperationMode.CAMPAIGN,
        ConsentPurpose.POLITICAL_COMMUNICATION,
      ),
      this.prisma.voter.findMany({
        where: { tenantId },
        include: {
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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const headers = [
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

    const rows = voters.map((v) => {
      const consentCurrent = evaluateConsentEffectiveness(
        v.consentRecords[0] ?? null,
        notice?.version,
        checkedAt,
      ).active;

      return [
        this.maskSensitiveValue(v.documentId),
        v.firstName,
        v.lastName,
        v.phone ? this.maskSensitiveValue(v.phone) : '',
        v.email ? this.maskEmail(v.email) : '',
        v.puesto?.name ?? '',
        v.mesa?.toString() ?? '',
        consentCurrent ? 'Sí' : 'No',
        v.createdAt.toISOString().split('T')[0],
      ];
    });

    return [headers, rows];
  }

  private async exportTasks(
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<[string[], string[][]]> {
    const tasks = await this.prisma.task.findMany({
      where: { tenantId, mode },
      include: { assignee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Título',
      'Descripción',
      'Estado',
      'Prioridad',
      'Responsable',
      'Fecha límite',
      'Completada',
      'Creada',
    ];

    const rows = tasks.map((t) => [
      t.title,
      t.description ?? '',
      t.status,
      t.priority,
      t.assignee?.name ?? 'Sin asignar',
      t.dueAt ? t.dueAt.toISOString().split('T')[0] : '',
      t.completedAt ? t.completedAt.toISOString().split('T')[0] : '',
      t.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, rows];
  }

  private async exportCases(
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<[string[], string[][]]> {
    const cases = await this.prisma.issueCase.findMany({
      where: { tenantId, mode },
      include: {
        assignee: { select: { name: true } },
        voter: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
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

    const rows = cases.map((c) => [
      c.reference,
      c.title,
      c.category,
      c.sourceChannel ?? '',
      c.status,
      c.priority,
      c.assignee?.name ?? 'Sin asignar',
      c.voter
        ? `${c.voter.firstName} ${c.voter.lastName}`
        : (c.externalContactRef ?? ''),
      c.dueAt ? c.dueAt.toISOString().split('T')[0] : '',
      c.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, rows];
  }

  private async exportCommitments(
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<[string[], string[][]]> {
    const commitments = await this.prisma.commitment.findMany({
      where: { tenantId, mode },
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
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

    const rows = commitments.map((c) => [
      c.reference,
      c.title,
      c.status,
      c.owner?.name ?? 'Sin asignar',
      c.progress.toString(),
      c.targetDate ? c.targetDate.toISOString().split('T')[0] : '',
      c.isPublic ? 'Sí' : 'No',
      c.completedAt ? c.completedAt.toISOString().split('T')[0] : '',
      c.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, rows];
  }

  private async exportEvents(
    tenantId: string,
    mode: PoliticalOperationMode,
  ): Promise<[string[], string[][]]> {
    const events = await this.prisma.campaignEvent.findMany({
      where: { tenantId, mode },
      include: { responsible: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });

    const headers = [
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

    const rows = events.map((e) => [
      e.name,
      e.description ?? '',
      e.startsAt.toISOString(),
      e.endsAt.toISOString(),
      e.location ?? '',
      e.status,
      e.capacity?.toString() ?? '',
      e.responsible?.name ?? 'Sin asignar',
      e.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, rows];
  }

  private async exportUsers(tenantId: string): Promise<[string[], string[][]]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: { division: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const headers = [
      'Nombre',
      'Correo',
      'Rol',
      'Activo',
      'Territorio',
      'Fecha de ingreso',
    ];

    const rows = users.map((u) => [
      u.name,
      u.email,
      u.role,
      u.isActive ? 'Sí' : 'No',
      u.division?.name ?? 'Global',
      u.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, rows];
  }
}
