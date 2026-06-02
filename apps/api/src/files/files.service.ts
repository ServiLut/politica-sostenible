import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { Prisma } from '../../prisma/generated/prisma';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

interface JwtPayload {
  sub: string;
  tenantId: string;
}

interface TenantFileRecord {
  id: string;
  path: string;
  module: string;
  fileName: string;
  mimeType: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface TenantAuditRecord {
  id: string;
  actorId: string;
  action: string;
  module: string;
  timestamp: string;
  severity?: 'Info' | 'Warning' | 'Critical';
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async requestUploadUrl(
    authorization: string | undefined,
    dto: RequestUploadUrlDto,
  ) {
    const identity = await this.getIdentityFromAuthHeader(authorization);
    const supabase = this.getSupabaseAdminClient();

    const safeFileName = this.sanitizeFileName(dto.fileName);
    const objectPath = `${identity.tenantId}/${dto.module}/${Date.now()}-${safeFileName}`;

    const { data, error } = await supabase.storage
      .from(this.getStorageBucket())
      .createSignedUploadUrl(objectPath);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException('No se pudo generar URL firmada');
    }

    const publicUrl = supabase.storage
      .from(this.getStorageBucket())
      .getPublicUrl(objectPath).data.publicUrl;

    return {
      path: objectPath,
      signedUrl: data.signedUrl,
      token: data.token,
      bucket: this.getStorageBucket(),
      publicUrl,
    };
  }

  async confirmUpload(
    authorization: string | undefined,
    dto: ConfirmUploadDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const identity = await this.getIdentityFromAuthHeader(authorization);
    const expectedPrefix = `${identity.tenantId}/${dto.module}/`;
    if (!dto.path.startsWith(expectedPrefix)) {
      throw new BadRequestException('Ruta inválida para el tenant actual');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { id: true, config: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant no encontrado');
    }

    const currentConfig = this.ensureConfigObject(tenant.config);
    const currentFiles = this.readFilesFromConfig(currentConfig);
    const currentAudit = this.readAuditFromConfig(currentConfig);

    const fileRecord: TenantFileRecord = {
      id: `file-${Date.now()}`,
      path: dto.path,
      module: dto.module,
      fileName: dto.fileName,
      mimeType: dto.mimeType ?? null,
      uploadedBy: identity.userId,
      uploadedAt: new Date().toISOString(),
    };

    const auditRecord: TenantAuditRecord = {
      id: `audit-${Date.now()}`,
      actorId: identity.userId,
      action: 'FILE_CONFIRMED',
      module: dto.module,
      timestamp: new Date().toISOString(),
      severity: 'Info',
      ip: clientIp ?? null,
      userAgent: userAgent ?? null,
      metadata: {
        fileName: dto.fileName,
        path: dto.path,
      },
    };

    const newConfig = {
      ...currentConfig,
      files: [fileRecord, ...currentFiles].slice(0, 2000),
      auditLogs: [auditRecord, ...currentAudit].slice(0, 5000),
    };

    await this.prisma.tenant.update({
      where: { id: identity.tenantId },
      data: { config: newConfig as unknown as Prisma.InputJsonValue },
    });

    const supabase = this.getSupabaseAdminClient();
    const publicUrl = supabase.storage
      .from(this.getStorageBucket())
      .getPublicUrl(dto.path).data.publicUrl;

    return {
      ...fileRecord,
      publicUrl,
    };
  }

  async listFiles(authorization: string | undefined, module?: string) {
    const identity = await this.getIdentityFromAuthHeader(authorization);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { config: true },
    });

    const currentConfig = this.ensureConfigObject(tenant?.config);
    const files = this.readFilesFromConfig(currentConfig);
    const filtered = module ? files.filter((f) => f.module === module) : files;

    const supabase = this.getSupabaseAdminClient();
    return filtered.map((f) => ({
      ...f,
      publicUrl: supabase.storage
        .from(this.getStorageBucket())
        .getPublicUrl(f.path).data.publicUrl,
    }));
  }

  async listAuditLogs(
    authorization: string | undefined,
    query: {
      module?: string;
      severity?: string;
      q?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const identity = await this.getIdentityFromAuthHeader(authorization);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { config: true },
    });

    const currentConfig = this.ensureConfigObject(tenant?.config);
    const allAuditLogs = this.readAuditFromConfig(currentConfig);
    const allModules = Array.from(
      new Set(allAuditLogs.map((log) => log.module)),
    ).sort();

    const userIds = Array.from(
      new Set(allAuditLogs.map((log) => log.actorId).filter(Boolean)),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            tenantId: identity.tenantId,
            id: { in: userIds },
          },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const search = (query.q || '').trim().toLowerCase();
    const filtered = allAuditLogs
      .filter((log) => {
        if (query.module && log.module !== query.module) return false;
        if (query.severity && log.severity !== query.severity) return false;

        const datePart = log.timestamp.split('T')[0] || '';
        if (query.startDate && datePart < query.startDate) return false;
        if (query.endDate && datePart > query.endDate) return false;

        if (search) {
          const actor = userMap.get(log.actorId);
          const actorLabel = actor?.name || actor?.email || log.actorId;
          const haystack =
            `${actorLabel} ${log.action} ${log.module} ${log.ip ?? ''}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }

        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const safePageSize = Math.min(
      Math.max(Number(query.pageSize || 10), 1),
      100,
    );
    const safePage = Math.max(Number(query.page || 1), 1);
    const total = filtered.length;
    const start = (safePage - 1) * safePageSize;
    const paged = filtered.slice(start, start + safePageSize);

    return {
      items: paged.map((log) => {
        const actor = userMap.get(log.actorId);
        return {
          id: log.id,
          actorId: log.actorId,
          actor: actor?.name || actor?.email || log.actorId,
          action: log.action,
          module: log.module,
          severity: log.severity || 'Info',
          timestamp: log.timestamp,
          ip: log.ip || 'N/A',
          userAgent: log.userAgent || null,
          metadata: log.metadata || null,
        };
      }),
      total,
      page: safePage,
      pageSize: safePageSize,
      availableModules: allModules,
    };
  }

  async createAuditLog(
    authorization: string | undefined,
    dto: CreateAuditLogDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const identity = await this.getIdentityFromAuthHeader(authorization);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { id: true, config: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant no encontrado');
    }

    const currentConfig = this.ensureConfigObject(tenant.config);
    const currentAudit = this.readAuditFromConfig(currentConfig);

    const auditRecord: TenantAuditRecord = {
      id: `audit-${Date.now()}`,
      actorId: identity.userId,
      action: dto.action,
      module: dto.module,
      timestamp: new Date().toISOString(),
      severity: dto.severity || 'Info',
      ip: clientIp ?? null,
      userAgent: userAgent ?? null,
      metadata: dto.metadata,
    };

    const newConfig = {
      ...currentConfig,
      auditLogs: [auditRecord, ...currentAudit].slice(0, 5000),
    };

    await this.prisma.tenant.update({
      where: { id: identity.tenantId },
      data: { config: newConfig as unknown as Prisma.InputJsonValue },
    });

    return {
      id: auditRecord.id,
      actor: dto.actor || identity.userId,
      action: auditRecord.action,
      module: auditRecord.module,
      severity: auditRecord.severity,
      ip: auditRecord.ip || 'N/A',
      timestamp: auditRecord.timestamp,
    };
  }

  private async getIdentityFromAuthHeader(authorization?: string) {
    const token = this.extractBearerToken(authorization);
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (!payload?.sub || !payload?.tenantId) {
      throw new UnauthorizedException('Token sin identidad completa');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
    };
  }

  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header requerido');
    }
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de Authorization inválido');
    }
    return token;
  }

  private sanitizeFileName(fileName: string) {
    return fileName
      .normalize('NFKD')
      .replace(/[^\w.-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
  }

  private ensureConfigObject(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {};
    }
    return config as Record<string, unknown>;
  }

  private readFilesFromConfig(
    config: Record<string, unknown>,
  ): TenantFileRecord[] {
    if (!Array.isArray(config.files)) return [];
    return config.files.filter((item): item is TenantFileRecord => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.path === 'string' &&
        typeof candidate.module === 'string' &&
        typeof candidate.fileName === 'string' &&
        typeof candidate.uploadedBy === 'string' &&
        typeof candidate.uploadedAt === 'string'
      );
    });
  }

  private readAuditFromConfig(
    config: Record<string, unknown>,
  ): TenantAuditRecord[] {
    if (!Array.isArray(config.auditLogs)) return [];
    return config.auditLogs.filter((item): item is TenantAuditRecord => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.actorId === 'string' &&
        typeof candidate.action === 'string' &&
        typeof candidate.module === 'string' &&
        typeof candidate.timestamp === 'string' &&
        (candidate.severity === undefined ||
          candidate.severity === 'Info' ||
          candidate.severity === 'Warning' ||
          candidate.severity === 'Critical')
      );
    });
  }

  private getStorageBucket() {
    return process.env.SUPABASE_STORAGE_BUCKET || 'politica-sostenible';
  }

  private getSupabaseAdminClient() {
    const url =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new InternalServerErrorException(
        'Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY',
      );
    }

    return createClient(url, serviceKey, {
      auth: {
        persistSession: false,
      },
    });
  }
}
