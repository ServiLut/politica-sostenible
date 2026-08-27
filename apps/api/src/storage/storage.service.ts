import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  PoliticalOperationMode,
  Role,
  TenantType,
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
import { PrismaService } from '../prisma/prisma.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
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
  [StorageModuleName.EVIDENCE]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

const CAMPAIGN_ONLY_STORAGE_MODULES = new Set<StorageModuleName>([
  StorageModuleName.FINANCE,
  StorageModuleName.E14,
]);

const PUBLIC_OFFICE_EVIDENCE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
];

@Injectable()
export class StorageService {
  constructor(
    private readonly storageGateway: SupabaseStorageGateway,
    private readonly prisma: PrismaService,
  ) {}

  async createUploadUrl(user: AuthenticatedUser, dto: CreateUploadUrlDto) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    this.requireIdentitySegment(user.userId, 'usuario');
    await this.assertModuleAccess(user, dto.module, tenantId);
    const metadata = this.validateUploadMetadata(dto.module, dto);
    // El nombre original puede contener PII. La ruta persistida usa sólo un
    // identificador aleatorio y la extensión ya validada.
    const path = `${tenantId}/${dto.module}/${randomUUID()}.${this.fileExtension(metadata.fileName)}`;
    const signedUpload = await this.storageGateway.createSignedUploadUrl(path);

    return {
      bucket: this.storageGateway.bucketName,
      path,
      uploadUrl: signedUpload.signedUrl,
      uploadToken: signedUpload.token,
      method: 'PUT' as const,
      headers: {
        'Content-Type': metadata.contentType,
      },
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

    const mode =
      authorizedMode ?? (await this.resolveOperationalMode(tenantId));
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: STORAGE_UPLOAD_CONFIRMED_ACTION,
        resourceType: STORAGE_OBJECT_RESOURCE_TYPE,
        resourceId: dto.path,
        metadata: {
          module: dto.module,
          bucket: this.storageGateway.bucketName,
          contentType: actualContentType,
          size: actualSize,
          ...(object.etag ? { etag: object.etag } : {}),
        },
      },
    });

    return {
      confirmed: true,
      path: dto.path,
      module: dto.module,
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
  ): Promise<PoliticalOperationMode | undefined> {
    const allowedRoles = STORAGE_MODULE_ROLES[module];
    if (
      allowedRoles &&
      (!user.role || !allowedRoles.includes(user.role as Role))
    ) {
      throw new ForbiddenException(
        'Tu rol no puede administrar archivos de este módulo',
      );
    }

    if (
      CAMPAIGN_ONLY_STORAGE_MODULES.has(module) ||
      module === StorageModuleName.EVIDENCE
    ) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      });

      if (CAMPAIGN_ONLY_STORAGE_MODULES.has(module)) {
        assertCampaignTenant(tenant);
        return PoliticalOperationMode.CAMPAIGN;
      }

      const isCampaign =
        tenant?.defaultMode === PoliticalOperationMode.CAMPAIGN &&
        tenant.type !== TenantType.PUBLIC_OFFICE;
      const isPublicOffice =
        tenant?.defaultMode === PoliticalOperationMode.PUBLIC_OFFICE &&
        tenant.type === TenantType.PUBLIC_OFFICE;
      if (!isCampaign && !isPublicOffice) {
        throw new ForbiddenException(
          'El modo operativo del tenant no permite administrar evidencia',
        );
      }

      if (
        isPublicOffice &&
        !PUBLIC_OFFICE_EVIDENCE_ROLES.includes(user.role as Role)
      ) {
        throw new ForbiddenException(
          'Tu rol no puede administrar evidencia de gestión pública',
        );
      }

      return isCampaign
        ? PoliticalOperationMode.CAMPAIGN
        : PoliticalOperationMode.PUBLIC_OFFICE;
    }

    return undefined;
  }

  private async resolveOperationalMode(
    tenantId: string,
  ): Promise<PoliticalOperationMode> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    const isCampaign =
      tenant?.defaultMode === PoliticalOperationMode.CAMPAIGN &&
      tenant.type !== TenantType.PUBLIC_OFFICE;
    const isPublicOffice =
      tenant?.defaultMode === PoliticalOperationMode.PUBLIC_OFFICE &&
      tenant.type === TenantType.PUBLIC_OFFICE;

    if (!isCampaign && !isPublicOffice) {
      throw new ForbiddenException(
        'El modo operativo del tenant no permite confirmar archivos',
      );
    }

    return isCampaign
      ? PoliticalOperationMode.CAMPAIGN
      : PoliticalOperationMode.PUBLIC_OFFICE;
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
