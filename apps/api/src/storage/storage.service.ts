import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
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
  StorageIntegrityStatus,
  StoredObjectStatus,
  StorageObjectModule,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertPlanQuotaInTransaction,
  ensureTenantSubscription,
} from '../auth/guards/plan-limits.guard';
import {
  assertCampaignTenant,
  assertCandidacyCampaignTenant,
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
  STORAGE_INTEGRITY_REQUIRED_MODULES,
  STORAGE_MAX_FILE_NAME_LENGTH,
  STORAGE_UPLOAD_POLICIES,
  StorageModuleName,
} from './storage.constants';
import {
  SignedUploadData,
  StoredObjectInfo,
  SupabaseStorageGateway,
} from './supabase-storage.gateway';
import {
  STORAGE_INTEGRITY_QUEUE_PORT,
  type StorageIntegrityQueuePort,
} from './storage-integrity-queue.constants';

interface NormalizedUploadMetadata {
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly contentSha256?: string;
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
  [StorageModuleName.CONSENT]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
  [StorageModuleName.ELECTORAL_CATALOG]: [Role.ADMIN],
  [StorageModuleName.SCRUTINY]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
  [StorageModuleName.ELECTORAL_CALENDAR]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.FINANCE_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.ZONE_COORDINATOR,
  ],
  [StorageModuleName.SIGNATURE_COLLECTION]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
  [StorageModuleName.PQRSD]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
};

const STORAGE_AUTHORIZATION_TTL_MS = 15 * 60 * 1_000;
const MAX_UPLOADS_PER_USER_PER_HOUR = 30;
const MAX_UPLOADS_PER_TENANT_PER_HOUR = 300;
const MAX_STORED_BYTES_PER_TENANT = 10 * 1024 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 300;
const DOWNLOADABLE_STORAGE_MODULES: readonly StorageModuleName[] = [
  StorageModuleName.FINANCE,
  StorageModuleName.E14,
  StorageModuleName.SCRUTINY,
  StorageModuleName.ELECTORAL_CALENDAR,
  StorageModuleName.SIGNATURE_COLLECTION,
  StorageModuleName.PQRSD,
];
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

const SCRUTINY_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const ELECTORAL_CALENDAR_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
] as const;

const SIGNATURE_COLLECTION_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const PQRSD_DOWNLOAD_ROLES = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly storageGateway: SupabaseStorageGateway,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_INTEGRITY_QUEUE_PORT)
    private readonly integrityQueue: StorageIntegrityQueuePort,
  ) {}

  async createUploadUrl(user: AuthenticatedUser, dto: CreateUploadUrlDto) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    const metadata = this.validateUploadMetadata(dto.module, dto);
    // Original names can contain PII; persistent paths use only a UUID.
    const path = `${tenantId}/${dto.module}/${randomUUID()}.${this.fileExtension(metadata.fileName)}`;
    const expiresAt = new Date(Date.now() + STORAGE_AUTHORIZATION_TTL_MS);

    await this.assertModuleAccess(user, dto.module, tenantId);
    await ensureTenantSubscription(this.prisma, tenantId);
    await this.cleanupOrphanedObjects(tenantId);

    await this.runQuotaTransaction(async (transaction) => {
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
          expectedSha256: metadata.contentSha256,
          expiresAt,
          documentCategory: dto.documentCategory,
          retentionPhase: dto.retentionPhase,
        },
        select: { id: true },
      });
    });

    let signedUpload: SignedUploadData;
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
        ...(metadata.contentSha256
          ? { contentSha256: metadata.contentSha256 }
          : {}),
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
        expectedSha256: true,
        integrityStatus: true,
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
      authorization.expectedSize !== metadata.size ||
      (authorization.expectedSha256 ?? null) !==
        (metadata.contentSha256 ?? null)
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
    const reportedSha256 = this.readStoredSha256(object);

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

    if (metadata.contentSha256 && reportedSha256 !== metadata.contentSha256) {
      throw new BadRequestException(
        'La huella SHA-256 declarada en Storage no coincide con la autorizacion',
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
          integrityStatus: authorization.expectedSha256
            ? StorageIntegrityStatus.PENDING
            : StorageIntegrityStatus.NOT_PROVIDED,
          actualSize,
          etag: object.etag,
          reportedSha256,
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
            contentIntegrity: authorization.expectedSha256
              ? 'CLIENT_DECLARED_UNVERIFIED'
              : 'NOT_PROVIDED',
            ...(object.etag ? { etag: object.etag } : {}),
          },
        },
      });
    });

    if (
      authorization.expectedSha256 &&
      authorization.integrityStatus !== StorageIntegrityStatus.VERIFIED &&
      authorization.integrityStatus !== StorageIntegrityStatus.FAILED
    ) {
      await this.integrityQueue.enqueue({
        tenantId,
        storedObjectId: authorization.id,
      });
    }

    const contentIntegrity = authorization.expectedSha256
      ? authorization.integrityStatus === StorageIntegrityStatus.VERIFIED
        ? StorageIntegrityStatus.VERIFIED
        : authorization.integrityStatus === StorageIntegrityStatus.FAILED
          ? StorageIntegrityStatus.FAILED
          : StorageIntegrityStatus.PENDING
      : StorageIntegrityStatus.NOT_PROVIDED;

    return {
      confirmed: true,
      objectId: authorization.id,
      path: dto.path,
      module: dto.module,
      contentIntegrity,
    };
  }

  async getIntegrityStatus(user: AuthenticatedUser, objectId: string) {
    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    const safeObjectId = this.requireIdentitySegment(objectId, 'objeto');
    const object = await this.prisma.storedObject.findFirst({
      where: {
        id: safeObjectId,
        tenantId,
        uploaderId: userId,
      },
      select: {
        id: true,
        integrityStatus: true,
        integrityVerifiedAt: true,
        integrityFailureCode: true,
      },
    });
    if (!object) {
      throw new NotFoundException('Estado de integridad no encontrado');
    }
    return {
      objectId: object.id,
      status: object.integrityStatus,
      verifiedAt: object.integrityVerifiedAt,
      failureCode: object.integrityFailureCode,
    };
  }

  async createDownloadUrl(user: AuthenticatedUser, dto: CreateDownloadUrlDto) {
    if (!DOWNLOADABLE_STORAGE_MODULES.includes(dto.module)) {
      throw new BadRequestException(
        'El módulo no admite lectura desde este flujo',
      );
    }

    const tenantId = this.requireIdentitySegment(user.tenantId, 'tenant');
    const userId = this.requireIdentitySegment(user.userId, 'usuario');
    let path: string;
    let resourceType:
      | 'FinancialEntry'
      | 'WitnessReport'
      | 'ScrutinyDocument'
      | 'SignatureCountCorrectionProposal'
      | 'PqrsdDocument'
      | 'ElectoralCalendarMilestoneResult';

    if (dto.module === StorageModuleName.FINANCE) {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: FINANCE_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertCampaignModeForDownload(
        tenantId,
        StorageModuleName.FINANCE,
      );
      const entry = await this.prisma.financialEntry.findFirst({
        where: { id: dto.resourceId, tenantId, evidenceUrl: { not: null } },
        select: { evidenceUrl: true },
      });
      if (!entry?.evidenceUrl) {
        throw new NotFoundException('Soporte financiero no encontrado');
      }
      path = entry.evidenceUrl;
      resourceType = 'FinancialEntry';
    } else if (dto.module === StorageModuleName.E14) {
      const access = await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: E14_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [Role.ZONE_COORDINATOR, Role.WITNESS],
      });
      await this.assertCampaignModeForDownload(tenantId, StorageModuleName.E14);
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
    } else if (dto.module === StorageModuleName.SCRUTINY) {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: SCRUTINY_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertCampaignModeForDownload(
        tenantId,
        StorageModuleName.SCRUTINY,
      );
      const document = await this.prisma.scrutinyDocument.findFirst({
        where: { id: dto.resourceId, tenantId },
        select: { storagePath: true },
      });
      if (!document) {
        throw new NotFoundException('Documento de escrutinio no encontrado');
      }
      path = document.storagePath;
      resourceType = 'ScrutinyDocument';
    } else if (dto.module === StorageModuleName.SIGNATURE_COLLECTION) {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: SIGNATURE_COLLECTION_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertCampaignModeForDownload(
        tenantId,
        StorageModuleName.SIGNATURE_COLLECTION,
      );
      const proposal =
        await this.prisma.signatureCountCorrectionProposal.findFirst({
          where: { id: dto.resourceId, tenantId },
          select: {
            evidenceStorageObject: { select: { path: true } },
          },
        });
      if (!proposal) {
        throw new NotFoundException(
          'Evidencia de la correccion de conteos no encontrada',
        );
      }
      path = proposal.evidenceStorageObject.path;
      resourceType = 'SignatureCountCorrectionProposal';
    } else if (dto.module === StorageModuleName.PQRSD) {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: PQRSD_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertPublicOfficeForDownload(tenantId);
      const document = await this.prisma.pqrsdDocument.findFirst({
        where: { id: dto.resourceId, tenantId },
        select: { storagePath: true },
      });
      if (!document) {
        throw new NotFoundException('Documento PQRSD no encontrado');
      }
      path = document.storagePath;
      resourceType = 'PqrsdDocument';
    } else {
      await resolveTerritorialAccess({
        client: this.prisma,
        tenantId,
        userId,
        allowedRoles: ELECTORAL_CALENDAR_DOWNLOAD_ROLES,
        territoriallyScopedRoles: [],
      });
      await this.assertCampaignModeForDownload(
        tenantId,
        StorageModuleName.ELECTORAL_CALENDAR,
      );
      const result =
        await this.prisma.electoralCalendarMilestoneResult.findFirst({
          where: {
            id: dto.resourceId,
            tenantId,
            evidencePath: { not: null },
          },
          select: { evidencePath: true },
        });
      if (!result?.evidencePath) {
        throw new NotFoundException('Evidencia del hito no encontrada');
      }
      path = result.evidencePath;
      resourceType = 'ElectoralCalendarMilestoneResult';
    }

    const stored = await this.prisma.storedObject.findFirst({
      where: {
        tenantId,
        path,
        module: this.toStoredModule(dto.module),
        status: StoredObjectStatus.CONSUMED,
        consumedByType: resourceType,
        consumedById: dto.resourceId,
        expectedSha256: { not: null },
        reportedSha256: { not: null },
        integrityStatus: StorageIntegrityStatus.VERIFIED,
        calculatedSha256: { not: null },
        integrityVerifiedAt: { not: null },
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
        mode:
          dto.module === StorageModuleName.PQRSD
            ? PoliticalOperationMode.PUBLIC_OFFICE
            : PoliticalOperationMode.CAMPAIGN,
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
    raw: {
      fileName: string;
      contentType: string;
      size: number;
      contentSha256?: string;
    },
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

    const contentSha256 = raw.contentSha256?.trim();
    const requiresIndependentIntegrity = (
      STORAGE_INTEGRITY_REQUIRED_MODULES as readonly StorageModuleName[]
    ).includes(module);
    if (contentSha256 && !requiresIndependentIntegrity) {
      throw new BadRequestException(
        'La huella de contenido solo esta habilitada para evidencia electoral',
      );
    }
    if (contentSha256 && !/^[0-9a-f]{64}$/.test(contentSha256)) {
      throw new BadRequestException(
        'contentSha256 debe ser una huella SHA-256 hexadecimal',
      );
    }
    if (requiresIndependentIntegrity && !contentSha256) {
      throw new BadRequestException(
        `${module} exige SHA-256 antes de autorizar o confirmar el archivo`,
      );
    }

    return {
      fileName,
      contentType,
      size: raw.size,
      ...(contentSha256 ? { contentSha256 } : {}),
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
    if (module === StorageModuleName.PQRSD) {
      if (tenant?.type !== TenantType.PUBLIC_OFFICE) {
        throw new ForbiddenException(
          'Los documentos PQRSD solo pertenecen a tenants PUBLIC_OFFICE',
        );
      }
      return PoliticalOperationMode.PUBLIC_OFFICE;
    }
    if (module === StorageModuleName.E14) {
      assertCandidacyCampaignTenant(tenant);
    } else {
      assertCampaignTenant(tenant);
    }
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

    await assertPlanQuotaInTransaction(
      transaction,
      tenantId,
      'storage',
      requestedSize,
    );

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
            integrityStatus: StorageIntegrityStatus.NOT_PROVIDED,
            actualSize: null,
            etag: null,
            confirmedAt: null,
            calculatedSha256: null,
            observedSize: null,
            observedContentType: null,
            integrityCheckedAt: null,
            integrityVerifiedAt: null,
            integrityFailureCode: null,
            integrityVerificationAttempts: 0,
            integrityVerificationStartedAt: null,
            integrityVerificationLeaseId: null,
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

  private async runQuotaTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          // The plan advisory lock is followed by fresh quota reads.
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        });
      } catch (error) {
        const errorCode =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof (error as Record<string, unknown>).code === 'string'
            ? (error as Record<string, unknown>).code
            : undefined;
        const serializationConflict = errorCode === 'P2034';
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
      [StorageModuleName.CONSENT]: StorageObjectModule.CONSENT,
      [StorageModuleName.ELECTORAL_CATALOG]:
        StorageObjectModule.ELECTORAL_CATALOG,
      [StorageModuleName.SCRUTINY]: StorageObjectModule.SCRUTINY,
      [StorageModuleName.ELECTORAL_CALENDAR]:
        StorageObjectModule.ELECTORAL_CALENDAR,
      [StorageModuleName.SIGNATURE_COLLECTION]:
        StorageObjectModule.SIGNATURE_COLLECTION,
      [StorageModuleName.PQRSD]: StorageObjectModule.PQRSD,
    };
    return mapping[module];
  }

  private async assertCampaignModeForDownload(
    tenantId: string,
    module: StorageModuleName,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    if (module === StorageModuleName.E14) {
      assertCandidacyCampaignTenant(tenant);
    } else {
      assertCampaignTenant(tenant);
    }
  }

  private async assertPublicOfficeForDownload(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (tenant?.type !== TenantType.PUBLIC_OFFICE) {
      throw new ForbiddenException(
        'Los documentos PQRSD solo pertenecen a tenants PUBLIC_OFFICE',
      );
    }
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

  private readStoredSha256(object: StoredObjectInfo): string | undefined {
    const candidate = this.readMetadataValue(object.metadata, [
      'contentSha256',
      'sha256',
    ]);
    if (candidate === undefined) return undefined;
    if (typeof candidate !== 'string' || !/^[0-9a-f]{64}$/.test(candidate)) {
      throw new BadRequestException(
        'Storage no reporto una huella SHA-256 valida para el archivo',
      );
    }
    return candidate;
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
