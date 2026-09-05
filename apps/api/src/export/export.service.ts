import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { buildCsvRow } from '../common/utils/csv.util';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async generateExport(
    moduleName: string,
    user: AuthenticatedUser,
    filters?: any,
  ): Promise<Buffer> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });

    if (!tenant) {
      throw new BadRequestException('Organización no encontrada');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true },
    });
    const actorName = actor?.name ?? 'Usuario';
    const actorEmail = user.email ?? 'Sin correo';

    const date = new Date().toISOString().split('T')[0];
    const watermark = `Exportado por ${actorName} (${actorEmail}) el ${date} — Organización: ${tenant.name} — Datos confidenciales`;
    
    let headers: string[] = [];
    let rows: any[][] = [];

    switch (moduleName) {
      case 'personas':
        [headers, rows] = await this.exportVoters(user.tenantId);
        break;
      case 'tareas':
        [headers, rows] = await this.exportTasks(user.tenantId);
        break;
      case 'casos':
        [headers, rows] = await this.exportCases(user.tenantId);
        break;
      case 'compromisos':
        [headers, rows] = await this.exportCommitments(user.tenantId);
        break;
      case 'eventos':
        [headers, rows] = await this.exportEvents(user.tenantId);
        break;
      case 'equipo':
        [headers, rows] = await this.exportUsers(user.tenantId);
        break;
      default:
        throw new BadRequestException(`Módulo no soportado para exportación: ${moduleName}`);
    }

    // Create AuditEvent
    await this.prisma.auditEvent.create({
      data: {
        tenantId: user.tenantId,
        mode: 'CAMPAIGN', // Using CAMPAIGN as default, wait maybe it's better to get the active mode or leave it out if optional or use the user's current context
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
      ...rows.map(row => buildCsvRow(row))
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

  private async exportVoters(tenantId: string): Promise<[string[], any[][]]> {
    const voters = await this.prisma.voter.findMany({
      where: { tenantId },
      include: { puesto: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Documento', 'Nombre', 'Apellido', 'Teléfono', 'Correo', 
      'Puesto', 'Mesa', 'Consentimiento', 'Fecha de registro'
    ];

    const rows = voters.map(v => [
      this.maskSensitiveValue(v.documentId),
      v.firstName,
      v.lastName,
      v.phone ? this.maskSensitiveValue(v.phone) : '',
      v.email ?? '',
      v.puesto?.name ?? '',
      v.mesa ?? '',
      v.consentAccepted ? 'Sí' : 'No',
      v.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }

  private async exportTasks(tenantId: string): Promise<[string[], any[][]]> {
    const tasks = await this.prisma.task.findMany({
      where: { tenantId },
      include: { assignee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Título', 'Descripción', 'Estado', 'Prioridad', 'Responsable', 
      'Fecha límite', 'Completada', 'Creada'
    ];

    const rows = tasks.map(t => [
      t.title,
      t.description ?? '',
      t.status,
      t.priority,
      t.assignee?.name ?? 'Sin asignar',
      t.dueAt ? t.dueAt.toISOString().split('T')[0] : '',
      t.completedAt ? t.completedAt.toISOString().split('T')[0] : '',
      t.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }

  private async exportCases(tenantId: string): Promise<[string[], any[][]]> {
    const cases = await this.prisma.issueCase.findMany({
      where: { tenantId },
      include: { 
        assignee: { select: { name: true } },
        voter: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Referencia', 'Título', 'Categoría', 'Canal', 'Estado', 'Prioridad', 
      'Responsable', 'Persona vinculada', 'Fecha límite', 'Creado'
    ];

    const rows = cases.map(c => [
      c.reference,
      c.title,
      c.category,
      c.sourceChannel ?? '',
      c.status,
      c.priority,
      c.assignee?.name ?? 'Sin asignar',
      c.voter ? `${c.voter.firstName} ${c.voter.lastName}` : (c.externalContactRef ?? ''),
      c.dueAt ? c.dueAt.toISOString().split('T')[0] : '',
      c.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }

  private async exportCommitments(tenantId: string): Promise<[string[], any[][]]> {
    const commitments = await this.prisma.commitment.findMany({
      where: { tenantId },
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Referencia', 'Título', 'Estado', 'Propietario', 'Progreso (%)', 
      'Fecha objetivo', 'Público', 'Completado', 'Creado'
    ];

    const rows = commitments.map(c => [
      c.reference,
      c.title,
      c.status,
      c.owner?.name ?? 'Sin asignar',
      c.progress.toString(),
      c.targetDate ? c.targetDate.toISOString().split('T')[0] : '',
      c.isPublic ? 'Sí' : 'No',
      c.completedAt ? c.completedAt.toISOString().split('T')[0] : '',
      c.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }

  private async exportEvents(tenantId: string): Promise<[string[], any[][]]> {
    const events = await this.prisma.campaignEvent.findMany({
      where: { tenantId },
      include: { responsible: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });

    const headers = [
      'Nombre', 'Descripción', 'Inicio', 'Fin', 'Ubicación', 
      'Estado', 'Capacidad', 'Responsable', 'Creado'
    ];

    const rows = events.map(e => [
      e.name,
      e.description ?? '',
      e.startsAt.toISOString(),
      e.endsAt.toISOString(),
      e.location ?? '',
      e.status,
      e.capacity?.toString() ?? '',
      e.responsible?.name ?? 'Sin asignar',
      e.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }

  private async exportUsers(tenantId: string): Promise<[string[], any[][]]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: { division: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const headers = [
      'Nombre', 'Correo', 'Rol', 'Activo', 'Territorio', 'Fecha de ingreso'
    ];

    const rows = users.map(u => [
      u.name,
      u.email,
      u.role,
      u.isActive ? 'Sí' : 'No',
      u.division?.name ?? 'Global',
      u.createdAt.toISOString().split('T')[0]
    ]);

    return [headers, rows];
  }
}
