import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  PoliticalOperationMode,
  Prisma,
  Role,
  StoredObjectStatus,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import {
  STORAGE_OBJECT_RESOURCE_TYPE,
  STORAGE_UPLOAD_CONFIRMED_ACTION,
} from '../common/utils/confirmed-storage-upload.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateDownloadUrlDto } from './dto/create-download-url.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import {
  STORAGE_MAX_FILE_NAME_LENGTH,
  STORAGE_UPLOAD_POLICIES,
  StorageModuleName,
} from './storage.constants';
import {
  StoredObjectInfo,
  SupabaseStorageGateway,
} from './supabase-storage.gateway';

interface NormalizedUploadMetadata {
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}

type StorageAccessClient = Pick<Prisma.TransactionClient, 'tenant' | 'user'>;

const STORAGE_MODULE_ROLES: Partial<
  Record<StorageModuleName, readonly Role[]>
> = {
  [StorageModuleName.FINANCE]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.FINANCE_MANAGER,
  ],
  [StorageModuleName.E14]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  ],
};

const STORAGE_AUTHORIZATION_TTL_MS = 15 * 60 * 1_000;
const MAX_UPLOADS_PER_USER_PER_HOUR = 30;
const MAX_UPLOADS_PER_TENANT_PER_HOUR = 300;
const MAX_STORED_BYTES_PER_TENANT = 10 * 1024 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 300;
const CONFIRMED_ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1_000;
const ORPHAN_CLEANUP_BATCH_SIZE = 10;

const FINANCE_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const E14_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly storageGateway: SupabaseStorageGateway,
    private readonly prisma: PrismaService,
  ) {}

  async createUploadUrl(user: AuthenticatedUser, dto: CreateUploadUrlDto) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    const metadata = this.validateUploadMetadata(dto.module, dto);
    // Original names can contain PII; persistent paths use only a UUID.
    const path = `${tenantId}/${dto.module}/${randomUUID()}.${this.fileExtension(metadata.fileName)}`;
    const expiresAt = new Date(Date.now() + STORAGE_AUTHORIZATION_TTL_MS);

    await this.assertModuleAccess(user, dto.module, tenantId);
    await this.cleanupOrphanedObjects(tenantId);

    await this.runSerializable(async (transaction) => {
      await this.assertModuleAccess(user, dto.module, tenantId, transaction);
      await this.assertUploadQuota(
        transaction,
        tenantId,
        userId,
        metadata.size,
      );
      await transaction.storedObject.create({
        data: {
          tenantId,
          uploaderId: userId,
          path,
          module: this.toStoredModule(dto.module),
          contentType: metadata.contentType,
          expectedSize: metadata.size,
          expiresAt,
        },
        select: { id: true },
      });
    });

    let signedUpload;
    try {
      signedUpload = await this.storageGateway.createSignedUploadUrl(path);
    } catch (error) {
      await this.prisma.storedObject.updateMany({
        where: {
          tenantId,
          path,
          status: StoredObjectStatus.ISSUED,
        },
        data: { status: StoredObjectStatus.EXPIRED },
      });
      throw error;
    }

    return {
      bucket: this.storageGateway.bucketName,
      path,
      uploadUrl: signedUpload.signedUrl,
      uploadToken: signedUpload.token,
      method: 'PUT' as const,
      headers: { 'Content-Type': metadata.contentType },
      metadata: {
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        size: metadata.size,
      },
    };
  }

  async completeUpload(user: AuthenticatedUser, dto: CompleteUploadDto) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    const authorizedMode = await this.assertModuleAccess(
      user,
      dto.module,
      tenantId,
    );
    const metadata = this.validateUploadMetadata(dto.module, dto.metadata);
    this.assertOwnedCanonicalPath(
      tenantId,
      dto.module,
      dto.path,
      this.fileExtension(metadata.fileName),
    );

    const authorization = await this.prisma.storedObject.findFirst({
      where: {
        tenantId,
        uploaderId: userId,
        path: dto.path,
        module: this.toStoredModule(dto.module),
        status: {
          in: [
            StoredObjectStatus.ISSUED,
            StoredObjectStatus.CONFIRMED,
            StoredObjectStatus.CONSUMED,
          ],
        },
      },
      select: {
        id: true,
        contentType: true,
        expectedSize: true,
        expiresAt: true,
        status: true,
      },
    });

    if (!authorization) {
      throw new NotFoundException(
        'No existe una autorización vigente para confirmar este archivo',
      );
    }
    if (
      authorization.contentType !== metadata.contentType ||
      authorization.expectedSize !== metadata.size
    ) {
      throw new BadRequestException(
        'Los metadatos no coinciden con la autorización de subida',
      );
    }
    if (
      authorization.status === StoredObjectStatus.ISSUED &&
      authorization.expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.storedObject.updateMany({
        where: {
          id: authorization.id,
          tenantId,
          status: StoredObjectStatus.ISSUED,
        },
        data: { status: StoredObjectStatus.EXPIRED },
      });
      throw new ConflictException(
        'La autorización de subida expiró; solicita una nueva',
      );
    }

    const object = await this.storageGateway.getObjectInfo(dto.path);

    if (!object) {
      throw new NotFoundException(
        'El archivo no existe en el almacenamiento privado',
      );
    }

    const actualSize = this.readStoredSize(object);
    const actualContentType = this.readStoredContentType(object);

    if (actualSize !== metadata.size) {
      throw new BadRequestException(
        'El tamaño almacenado no coincide con el tamaño autorizado',
      );
    }

    if (actualContentType !== metadata.contentType) {
      throw new BadRequestException(
        'El tipo de contenido almacenado no coincide con el autorizado',
      );
    }

    const mode = authorizedMode;
    await this.prisma.$transaction(async (transaction) => {
      await this.assertModuleAccess(user, dto.module, tenantId, transaction);
      const transition = await transaction.storedObject.updateMany({
        where: {
          id: authorization.id,
          tenantId,
          uploaderId: userId,
          status: StoredObjectStatus.ISSUED,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: StoredObjectStatus.CONFIRMED,
          actualSize,
          etag: object.etag,
          confirmedAt: new Date(),
        },
      });

      if (transition.count === 0) {
        const current = await transaction.storedObject.findFirst({
          where: { id: authorization.id, tenantId, uploaderId: userId },
          select: { status: true },
        });
        if (
          current?.status !== StoredObjectStatus.CONFIRMED &&
          current?.status !== StoredObjectStatus.CONSUMED
        ) {
          throw new ConflictException(
            'La autorización ya no está disponible para confirmar',
          );
        }
        return;
      }

      await transaction.auditEvent.create({
        data: {
          tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: STORAGE_UPLOAD_CONFIRMED_ACTION,
          resourceType: STORAGE_OBJECT_RESOURCE_TYPE,
          resourceId: authorization.id,
          metadata: {
            module: dto.module,
            bucket: this.storageGateway.bucketName,
            contentType: actualContentType,
            size: actualSize,
            ...(object.etag ? { etag: object.etag } : {}),
          },
        },
      });
    });

    return {
      confirmed: true,
      path: dto.path,
      module: dto.module,
    };
  }

  async createDownloadUrl(user: AuthenticatedUser, dto: CreateDownloadUrlDto) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    let path: string;
    let resourceType: 'FinancialEntry' | 'WitnessReport';

    if (dto.module === StorageModuleName.FINANCE) {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: FINANCE_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertCampaignModeForDownload(tenantId);
      const entry = await this.prisma.financialEntry.findFirst({
        where: { id: dto.resourceId, tenantId, evidenceUrl: { not: null } },
        select: { evidenceUrl: true },
      });
      if (!entry?.evidenceUrl) {
        throw new NotFoundException('Soporte financiero no encontrado');
      }
      path = entry.evidenceUrl;
      resourceType = 'FinancialEntry';
    } else {
      const access = await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: E14_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [Role.ZONE_COORDINATOR, Role.WITNESS],
      });
      await this.assertCampaignModeForDownload(tenantId);
      const report = await this.prisma.witnessReport.findFirst({
        where: {
          id: dto.resourceId,
          tenantId,
          ...(access.divisionIds === null
            ? {}
            : { puestoId: { in: access.divisionIds } }),
        },
        select: { e14ImageUrl: true },
      });
      if (!report) {
        throw new NotFoundException('Acta E-14 no encontrada');
      }
      path = report.e14ImageUrl;
      resourceType = 'WitnessReport';
    }

    const stored = await this.prisma.storedObject.findFirst({
      where: {
        tenantId,
        path,
        module: this.toStoredModule(dto.module),
        status: StoredObjectStatus.CONSUMED,
        consumedByType: resourceType,
        consumedById: dto.resourceId,
      },
      select: { id: true },
    });
    if (!stored) {
      throw new NotFoundException('El archivo privado no está disponible');
    }

    const signed = await this.storageGateway.createSignedDownloadUrl(
      path,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'STORAGE_DOWNLOAD_AUTHORIZED',
        resourceType,
        resourceId: dto.resourceId,
        metadata: { module: dto.module, storedObjectId: stored.id },
      },
    });

    return {
      url: signed.signedUrl,
      expiresAt: new Date(
        Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1_000,
      ).toISOString(),
    };
  }

  private validateUploadMetadata(
    module: StorageModuleName,
    raw: { fileName: string; contentType: string; size: number },
  ): NormalizedUploadMetadata {
    const policy = STORAGE_UPLOAD_POLICIES[module];

    if (!policy) {
      throw new BadRequestException('El módulo de almacenamiento no es válido');
    }

    const fileName = this.validateFileName(raw.fileName);
    const contentType = this.normalizeContentType(raw.contentType);

    if (!Number.isSafeInteger(raw.size) || raw.size <= 0) {
      throw new BadRequestException(
        'El tamaño del archivo debe ser un entero positivo',
      );
    }

    if (raw.size > policy.maxBytes) {
      throw new BadRequestException(
        `El archivo excede el límite de ${policy.maxBytes} bytes para ${module}`,
      );
    }

    const allowedExtensions = policy.mimeTypes[contentType];

    if (!allowedExtensions) {
      throw new BadRequestException(
        `El tipo de contenido no está permitido para ${module}`,
      );
    }

    const extension = this.fileExtension(fileName);
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        'La extensión del archivo no coincide con su tipo de contenido',
      );
    }

    return {
      fileName,
      contentType,
      size: raw.size,
    };
  }

  private async assertModuleAccess(
    user: AuthenticatedUser,
    module: StorageModuleName,
    tenantId: string,
    client: StorageAccessClient = this.prisma,
  ): Promise<PoliticalOperationMode> {
    const actor = await client.user.findFirst({
      where: { id: user.userId, tenantId, isActive: true },
      select: { role: true },
    });
    if (!actor) {
      throw new ForbiddenException(
        'El usuario no tiene permisos vigentes para administrar archivos',
      );
    }

    const allowedRoles = STORAGE_MODULE_ROLES[module];
    if (allowedRoles && !allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(
        'Tu rol no puede administrar archivos de este módulo',
      );
    }

    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
    return PoliticalOperationMode.CAMPAIGN;
  }

  private async assertUploadQuota(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    requestedSize: number,
  ): Promise<void> {
    const now = new Date();
    await transaction.storedObject.updateMany({
      where: {
        tenantId,
        status: StoredObjectStatus.ISSUED,
        expiresAt: { lte: now },
      },
      data: { status: StoredObjectStatus.EXPIRED },
    });

    const hourAgo = new Date(now.getTime() - 60 * 60 * 1_000);
    const activeStatuses = [
      StoredObjectStatus.ISSUED,
      StoredObjectStatus.CONFIRMED,
      StoredObjectStatus.CONSUMED,
    ];
    const [userUploads, tenantUploads, storedBytes] = await Promise.all([
      transaction.storedObject.count({
        where: {
          tenantId,
          uploaderId: userId,
          createdAt: { gte: hourAgo },
          status: { in: activeStatuses },
        },
      }),
      transaction.storedObject.count({
        where: {
          tenantId,
          createdAt: { gte: hourAgo },
          status: { in: activeStatuses },
        },
      }),
      transaction.storedObject.aggregate({
        where: { tenantId, status: { in: activeStatuses } },
        _sum: { expectedSize: true },
      }),
    ]);

    if (
      userUploads >= MAX_UPLOADS_PER_USER_PER_HOUR ||
      tenantUploads >= MAX_UPLOADS_PER_TENANT_PER_HOUR
    ) {
      throw new HttpException(
        'Se alcanzó el límite temporal de autorizaciones de subida',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      Number(storedBytes._sum.expectedSize ?? 0) + requestedSize >
      MAX_STORED_BYTES_PER_TENANT
    ) {
      throw new PayloadTooLargeException(
        'La organización alcanzó su cuota de almacenamiento',
      );
    }
  }

  private async cleanupOrphanedObjects(tenantId: string): Promise<void> {
    const now = new Date();
    const confirmedBefore = new Date(
      now.getTime() - CONFIRMED_ORPHAN_RETENTION_MS,
    );
    const candidates = await this.prisma.storedObject.findMany({
      where: {
        tenantId,
        consumedAt: null,
        OR: [
          { status: StoredObjectStatus.EXPIRED },
          { status: StoredObjectStatus.ISSUED, expiresAt: { lte: now } },
          {
            status: StoredObjectStatus.CONFIRMED,
            confirmedAt: { lte: confirmedBefore },
          },
        ],
      },
      select: { id: true, status: true, path: true },
      orderBy: { createdAt: 'asc' },
      take: ORPHAN_CLEANUP_BATCH_SIZE,
    });

    for (const candidate of candidates) {
      let claimed = candidate.status === StoredObjectStatus.EXPIRED;
      if (!claimed) {
        const transition = await this.prisma.storedObject.updateMany({
          where: {
            id: candidate.id,
            tenantId,
            status: candidate.status,
            consumedAt: null,
            ...(candidate.status === StoredObjectStatus.ISSUED
              ? { expiresAt: { lte: now } }
              : { confirmedAt: { lte: confirmedBefore } }),
          },
          data: {
            status: StoredObjectStatus.EXPIRED,
            actualSize: null,
            etag: null,
            confirmedAt: null,
          },
        });
        claimed = transition.count === 1;
      }
      if (!claimed) continue;

      try {
        await this.storageGateway.removeObject(candidate.path);
        await this.prisma.storedObject.deleteMany({
          where: {
            id: candidate.id,
            tenantId,
            status: StoredObjectStatus.EXPIRED,
            consumedAt: null,
          },
        });
      } catch {
        // Keep the claimed row so a later authorized upload retries cleanup.
        this.logger.warn(
          'Quedó pendiente la limpieza de un objeto privado huérfano',
        );
      }
    }
  }

  private async runSerializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const serializationConflict =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2034';
        if (!serializationConflict) throw error;
        if (attempt === 3) {
          throw new ConflictException(
            'La cuota de almacenamiento cambió durante la operación; intenta nuevamente',
          );
        }
      }
    }

    throw new ConflictException(
      'No fue posible reservar almacenamiento en este momento',
    );
  }

  private toStoredModule(module: StorageModuleName): StorageObjectModule {
    const mapping: Record<StorageModuleName, StorageObjectModule> = {
      [StorageModuleName.FINANCE]: StorageObjectModule.FINANCE,
      [StorageModuleName.E14]: StorageObjectModule.E14,
    };
    return mapping[module];
  }

  private async assertCampaignModeForDownload(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }

  private validateFileName(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('El nombre del archivo no es válido');
    }

    const fileName = value.trim();

    if (
      !fileName ||
      fileName.length > STORAGE_MAX_FILE_NAME_LENGTH ||
      fileName !== value ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('%') ||
      this.containsControlCharacter(fileName) ||
      !/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.[a-zA-Z0-9]{2,10}$/u.test(fileName)
    ) {
      throw new BadRequestException(
        'El nombre del archivo contiene caracteres o rutas no permitidos',
      );
    }

    return fileName;
  }

  private fileExtension(fileName: string): string {
    return fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  }

  private containsControlCharacter(value: string): boolean {
    return [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
  }

  private normalizeContentType(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('El tipo de contenido no es válido');
    }

    const contentType = value.trim().toLowerCase();
    if (!contentType || contentType !== value) {
      throw new BadRequestException('El tipo de contenido no es válido');
    }

    return contentType;
  }

  private requireIdentitySegment(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
      throw new UnauthorizedException(
        `El token no contiene un identificador de ${label} válido`,
      );
    }

    return value;
  }

  private assertOwnedCanonicalPath(
    tenantId: string,
    module: StorageModuleName,
    path: string,
    extension: string,
  ): void {
    const expectedPrefix = `${tenantId}/${module}/`;

    if (!path.startsWith(expectedPrefix)) {
      throw new ForbiddenException(
        'No puede confirmar archivos de otro tenant o módulo',
      );
    }

    const objectName = path.slice(expectedPrefix.length);
    const uuidPattern =
      '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const expectedName = new RegExp(
      `^${uuidPattern}\\.${this.escapeRegExp(extension)}$`,
      'i',
    );

    if (
      !objectName ||
      objectName.includes('/') ||
      objectName.includes('\\') ||
      objectName.includes('..') ||
      !expectedName.test(objectName)
    ) {
      throw new BadRequestException(
        'La ruta del archivo no tiene el formato canónico autorizado',
      );
    }
  }

  private readStoredSize(object: StoredObjectInfo): number {
    const metadataSize = this.readMetadataValue(object.metadata, [
      'size',
      'contentLength',
      'content-length',
    ]);
    const candidate = object.size ?? metadataSize;
    const size = typeof candidate === 'string' ? Number(candidate) : candidate;

    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
      throw new BadRequestException(
        'Storage no reportó un tamaño verificable para el archivo',
      );
    }

    return size;
  }

  private readStoredContentType(object: StoredObjectInfo): string {
    const candidate =
      object.contentType ??
      this.readMetadataValue(object.metadata, [
        'mimetype',
        'contentType',
        'content-type',
      ]);

    if (typeof candidate !== 'string' || !candidate.trim()) {
      throw new BadRequestException(
        'Storage no reportó un tipo de contenido verificable',
      );
    }

    return candidate.trim().toLowerCase();
  }

  private readMetadataValue(
    metadata: Record<string, unknown> | undefined,
    keys: readonly string[],
  ): unknown {
    if (!metadata) {
      return undefined;
    }

    for (const key of keys) {
      if (metadata[key] !== undefined) {
        return metadata[key];
      }
    }

    return undefined;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
