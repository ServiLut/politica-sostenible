import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  AuditActorType,
  PoliticalOperationStage,
  Prisma,
  Role,
  StorageIntegrityStatus,
  StoredObjectStatus,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MfaService } from '../auth/mfa.service';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import {
  assertCampaignTenant,
  assertCandidacyCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
  type CampaignTenantState,
} from '../common/utils/campaign-mode.util';
import {
  resolveTerritorialAccess,
  type TerritorialAccess,
} from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModuleName } from '../storage/storage.constants';
import {
  type StoredObjectInfo,
  SupabaseStorageGateway,
} from '../storage/supabase-storage.gateway';
import {
  SignatureModuleQueryDto,
  SignDocumentDto,
  VerifySignatureQueryDto,
} from './dto/electronic-signature.dto';

type SignatureOperation = 'sign' | 'verify';

interface SignatureResourcePolicy {
  readonly storedModule: StorageObjectModule;
  readonly resourceType: 'FinancialEntry' | 'WitnessReport';
  readonly signRoles: readonly Role[];
  readonly verifyRoles: readonly Role[];
  readonly territoriallyScopedRoles: readonly Role[];
}

interface IntegrityDocument {
  readonly id: string;
  readonly path: string;
  readonly module: StorageObjectModule;
  readonly uploaderId: string;
  readonly contentType: string;
  readonly actualSize: number;
  readonly etag: string;
  readonly confirmedAt: Date;
  readonly consumedAt: Date;
  readonly consumedByType: string;
  readonly consumedById: string;
  readonly calculatedSha256: string;
  readonly integrityVerifiedAt: Date;
}

const FINANCE_SIGN_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
] as const;

const E14_SIGN_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

const REVIEW_ROLES = [Role.COMPLIANCE_OFFICER, Role.AUDITOR] as const;

const SIGNATURE_RESOURCE_POLICIES: Readonly<
  Partial<Record<StorageModuleName, SignatureResourcePolicy>>
> = {
  [StorageModuleName.FINANCE]: {
    storedModule: StorageObjectModule.FINANCE,
    resourceType: 'FinancialEntry',
    signRoles: FINANCE_SIGN_ROLES,
    verifyRoles: [...FINANCE_SIGN_ROLES, ...REVIEW_ROLES],
    territoriallyScopedRoles: [],
  },
  [StorageModuleName.E14]: {
    storedModule: StorageObjectModule.E14,
    resourceType: 'WitnessReport',
    signRoles: E14_SIGN_ROLES,
    verifyRoles: [...E14_SIGN_ROLES, ...REVIEW_ROLES],
    territoriallyScopedRoles: [Role.ZONE_COORDINATOR, Role.WITNESS],
  },
};

const SIGNATURE_HASH_PREFIX = 'v2:';
const SIGNING_CANDIDATE_LIMIT = 100;

@Injectable()
export class ElectronicSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentEvidence: ConsentEvidenceService,
    private readonly storage: SupabaseStorageGateway,
    private readonly mfa: MfaService,
  ) {}

  async listSigningCandidates(
    user: AuthenticatedUser,
    query: SignatureModuleQueryDto,
  ) {
    const policy = this.getPolicy(query.module);
    const access = await this.resolveAccess(user, policy, 'sign');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    this.assertTenantModuleAccess(tenant, query.module);

    const documents = await this.prisma.storedObject.findMany({
      where: {
        tenantId: user.tenantId,
        uploaderId: user.userId,
        module: policy.storedModule,
        status: StoredObjectStatus.CONSUMED,
        etag: { not: null },
        actualSize: { not: null },
        confirmedAt: { not: null },
        consumedAt: { not: null },
        consumedByType: policy.resourceType,
        consumedById: { not: null },
        expectedSha256: { not: null },
        reportedSha256: { not: null },
        calculatedSha256: { not: null },
        integrityStatus: StorageIntegrityStatus.VERIFIED,
        integrityVerifiedAt: { not: null },
      },
      orderBy: [{ consumedAt: 'desc' }, { id: 'desc' }],
      take: SIGNING_CANDIDATE_LIMIT + 1,
      select: {
        id: true,
        path: true,
        contentType: true,
        actualSize: true,
        confirmedAt: true,
        consumedAt: true,
        consumedById: true,
        calculatedSha256: true,
        integrityVerifiedAt: true,
        signatures: {
          where: { signerId: user.userId },
          orderBy: { signedAt: 'desc' },
          take: 1,
          select: { id: true, signedAt: true },
        },
      },
    });

    const resourceIds = documents
      .map(({ consumedById }) => consumedById)
      .filter((resourceId): resourceId is string => Boolean(resourceId));
    if (resourceIds.length === 0) {
      return { items: [], limit: SIGNING_CANDIDATE_LIMIT, truncated: false };
    }

    if (query.module === StorageModuleName.FINANCE) {
      const resources = await this.prisma.financialEntry.findMany({
        where: {
          id: { in: resourceIds },
          tenantId: user.tenantId,
          reporterId: user.userId,
          evidenceUrl: { not: null },
        },
        select: {
          id: true,
          evidenceUrl: true,
          type: true,
          date: true,
          description: true,
        },
      });
      const resourcesById = new Map(
        resources.map((resource) => [resource.id, resource]),
      );
      const items = documents.flatMap((document) => {
        if (!document.consumedById) return [];
        const resource = resourcesById.get(document.consumedById);
        if (!resource || resource.evidenceUrl !== document.path) return [];
        return [
          this.presentSigningCandidate(document, {
            kind: 'FinancialEntry' as const,
            type: resource.type,
            occurredAt: resource.date,
            label: resource.description,
          }),
        ];
      });
      return {
        items: items.slice(0, SIGNING_CANDIDATE_LIMIT),
        limit: SIGNING_CANDIDATE_LIMIT,
        truncated: items.length > SIGNING_CANDIDATE_LIMIT,
      };
    }

    const resources = await this.prisma.witnessReport.findMany({
      where: {
        id: { in: resourceIds },
        tenantId: user.tenantId,
        witnessId: user.userId,
        ...(access.divisionIds === null
          ? {}
          : { puestoId: { in: access.divisionIds } }),
      },
      select: {
        id: true,
        e14ImageUrl: true,
        mesa: true,
        captureContext: true,
        puesto: { select: { code: true, name: true } },
      },
    });
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const items = documents.flatMap((document) => {
      if (!document.consumedById) return [];
      const resource = resourcesById.get(document.consumedById);
      if (!resource || resource.e14ImageUrl !== document.path) return [];
      return [
        this.presentSigningCandidate(document, {
          kind: 'WitnessReport' as const,
          mesa: resource.mesa,
          captureContext: resource.captureContext,
          pollingPlace: resource.puesto,
        }),
      ];
    });
    return {
      items: items.slice(0, SIGNING_CANDIDATE_LIMIT),
      limit: SIGNING_CANDIDATE_LIMIT,
      truncated: items.length > SIGNING_CANDIDATE_LIMIT,
    };
  }

  async signDocument(
    user: AuthenticatedUser,
    dto: SignDocumentDto,
    ipAddress?: string,
  ) {
    const policy = this.getPolicy(dto.module);
    const access = await this.resolveAccess(user, policy, 'sign');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    this.assertTenantModuleAccess(tenant, dto.module);

    await this.assertValidOtp(user, dto.otpCode);

    const rawDocument = await this.prisma.storedObject.findFirst({
      where: {
        id: dto.documentId,
        tenantId: user.tenantId,
        uploaderId: user.userId,
        module: policy.storedModule,
        status: StoredObjectStatus.CONSUMED,
        consumedAt: { not: null },
        consumedByType: policy.resourceType,
        consumedById: dto.resourceId,
        expectedSha256: { not: null },
        reportedSha256: { not: null },
        calculatedSha256: { not: null },
        integrityStatus: StorageIntegrityStatus.VERIFIED,
        integrityVerifiedAt: { not: null },
      },
      select: {
        id: true,
        path: true,
        module: true,
        uploaderId: true,
        contentType: true,
        etag: true,
        actualSize: true,
        confirmedAt: true,
        consumedAt: true,
        consumedByType: true,
        consumedById: true,
        status: true,
        calculatedSha256: true,
        integrityVerifiedAt: true,
      },
    });
    const document = this.asIntegrityDocument(
      rawDocument,
      policy,
      dto.resourceId,
      user.userId,
    );
    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    const resourceOwnerId = await this.findLinkedResourceOwner(
      user.tenantId,
      dto.module,
      dto.resourceId,
      document.path,
      access,
    );
    if (resourceOwnerId !== user.userId) {
      throw new NotFoundException('Documento no encontrado');
    }

    const currentObject = await this.storage.getObjectInfo(document.path);
    if (!currentObject) {
      throw new NotFoundException('El archivo del documento no existe');
    }
    if (!this.storageMetadataMatches(document, currentObject)) {
      throw new ConflictException(
        'El archivo cambió después de su confirmación y no puede firmarse',
      );
    }

    const documentHash = this.createBoundHash(
      user.tenantId,
      user.userId,
      dto.module,
      policy.resourceType,
      dto.resourceId,
      document,
    );

    return this.prisma.$transaction(async (transaction) => {
      // Serialize with operation closure and re-check inside the same
      // transaction that writes the signature. The request guard is useful
      // feedback, but it cannot by itself close the close-vs-sign race.
      await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        WITH signature_lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0)
          )
        )
        SELECT TRUE AS "locked" FROM signature_lifecycle_lock
      `);
      const operationProfile = await transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { stage: true },
      });
      if (operationProfile?.stage === PoliticalOperationStage.CLOSED) {
        throw new ConflictException({
          code: 'OPERATION_CLOSED',
          message:
            'La operacion esta cerrada y no admite nuevas firmas electronicas',
          currentStage: operationProfile.stage,
        });
      }

      const existingSignature = await transaction.electronicSignature.findFirst(
        {
          where: {
            tenantId: user.tenantId,
            documentId: document.id,
            signerId: user.userId,
          },
          select: { id: true },
        },
      );
      if (existingSignature) {
        throw new ConflictException({
          code: 'SIGNATURE_ALREADY_EXISTS',
          message: 'Este documento ya fue firmado por la persona autenticada',
          signatureId: existingSignature.id,
        });
      }

      const signature = await transaction.electronicSignature.create({
        data: {
          tenantId: user.tenantId,
          documentId: document.id,
          signerId: user.userId,
          documentHash,
        },
        select: {
          id: true,
          signedAt: true,
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: tenant.defaultMode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'DOCUMENT_SIGNED',
          resourceType: 'ElectronicSignature',
          resourceId: signature.id,
          sourceIpHash: ipAddress
            ? this.consentEvidence.hashIp(ipAddress)
            : null,
          metadata: {
            module: dto.module,
            linkedResourceType: policy.resourceType,
            linkedResourceId: dto.resourceId,
          },
        },
      });

      return {
        id: signature.id,
        signedAt: signature.signedAt,
        module: dto.module,
        resourceType: policy.resourceType,
        integrityScope: 'LINK_AND_STORAGE_METADATA' as const,
        contentIntegrity: 'VERIFIED' as const,
      };
    });
  }

  async verifySignature(
    user: AuthenticatedUser,
    signatureId: string,
    query: VerifySignatureQueryDto,
  ) {
    const policy = this.getPolicy(query.module);
    const access = await this.resolveAccess(user, policy, 'verify');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    this.assertTenantModuleAccess(tenant, query.module);

    const signature = await this.prisma.electronicSignature.findFirst({
      where: { id: signatureId, tenantId: user.tenantId },
      select: {
        id: true,
        signerId: true,
        documentHash: true,
        signedAt: true,
        document: {
          select: {
            id: true,
            path: true,
            module: true,
            uploaderId: true,
            contentType: true,
            etag: true,
            actualSize: true,
            confirmedAt: true,
            consumedAt: true,
            consumedByType: true,
            consumedById: true,
            status: true,
            calculatedSha256: true,
            integrityVerifiedAt: true,
          },
        },
      },
    });

    const document = this.asIntegrityDocument(
      signature?.document,
      policy,
      query.resourceId,
    );
    if (!signature || !document) {
      throw new NotFoundException('Firma no encontrada');
    }

    const resourceOwnerId = await this.findLinkedResourceOwner(
      user.tenantId,
      query.module,
      query.resourceId,
      document.path,
      access,
    );
    if (!resourceOwnerId) {
      throw new NotFoundException('Firma no encontrada');
    }

    const currentObject = await this.storage.getObjectInfo(document.path);
    const ownershipMatches =
      resourceOwnerId === document.uploaderId &&
      signature.signerId === document.uploaderId;
    const metadataMatches = Boolean(
      currentObject && this.storageMetadataMatches(document, currentObject),
    );
    const hashMatches = this.signatureHashMatches(
      signature.documentHash,
      user.tenantId,
      signature.signerId,
      query.module,
      policy.resourceType,
      query.resourceId,
      document,
    );

    return {
      id: signature.id,
      valid: ownershipMatches && metadataMatches && hashMatches,
      signedAt: signature.signedAt,
      module: query.module,
      resourceType: policy.resourceType,
      integrityScope: 'LINK_AND_STORAGE_METADATA' as const,
      contentIntegrity: 'VERIFIED' as const,
    };
  }

  private getPolicy(module: StorageModuleName): SignatureResourcePolicy {
    const policy = SIGNATURE_RESOURCE_POLICIES[module];
    if (!policy) {
      throw new BadRequestException('Módulo de firma no válido');
    }
    return policy;
  }

  private presentSigningCandidate<
    TResource extends
      | {
          kind: 'FinancialEntry';
          type: string;
          occurredAt: Date;
          label: string;
        }
      | {
          kind: 'WitnessReport';
          mesa: number;
          captureContext: string;
          pollingPlace: { code: string; name: string };
        },
  >(
    document: {
      id: string;
      contentType: string;
      actualSize: number | null;
      confirmedAt: Date | null;
      consumedAt: Date | null;
      consumedById: string | null;
      signatures: Array<{ id: string; signedAt: Date }>;
    },
    resource: TResource,
  ) {
    return {
      documentId: document.id,
      resourceId: document.consumedById!,
      contentType: document.contentType,
      actualSize: document.actualSize!,
      confirmedAt: document.confirmedAt!,
      consumedAt: document.consumedAt!,
      signature: document.signatures[0] ?? null,
      resource,
    };
  }

  private resolveAccess(
    user: AuthenticatedUser,
    policy: SignatureResourcePolicy,
    operation: SignatureOperation,
  ): Promise<TerritorialAccess> {
    return resolveTerritorialAccess({
      client: this.prisma,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles:
        operation === 'sign' ? policy.signRoles : policy.verifyRoles,
      territoriallyScopedRoles: policy.territoriallyScopedRoles,
    });
  }

  private async assertValidOtp(
    user: AuthenticatedUser,
    otpCode: string,
  ): Promise<void> {
    const valid = await this.mfa.verifyEnabledCode(
      user.userId,
      user.tenantId,
      otpCode,
    );
    if (!valid) {
      throw new ForbiddenException('Código OTP inválido');
    }
  }

  private asIntegrityDocument(
    document:
      | {
          id: string;
          path: string;
          module: StorageObjectModule;
          uploaderId: string;
          contentType: string;
          etag: string | null;
          actualSize: number | null;
          confirmedAt: Date | null;
          consumedAt: Date | null;
          consumedByType: string | null;
          consumedById: string | null;
          status: StoredObjectStatus;
          calculatedSha256: string | null;
          integrityVerifiedAt: Date | null;
        }
      | null
      | undefined,
    policy: SignatureResourcePolicy,
    resourceId: string,
    requiredUploaderId?: string,
  ): IntegrityDocument | null {
    if (
      !document ||
      document.module !== policy.storedModule ||
      document.status !== StoredObjectStatus.CONSUMED ||
      !document.etag ||
      document.actualSize === null ||
      !Number.isSafeInteger(document.actualSize) ||
      document.actualSize <= 0 ||
      !document.confirmedAt ||
      !document.consumedAt ||
      document.consumedByType !== policy.resourceType ||
      document.consumedById !== resourceId ||
      !document.calculatedSha256 ||
      !document.integrityVerifiedAt ||
      (requiredUploaderId !== undefined &&
        document.uploaderId !== requiredUploaderId)
    ) {
      return null;
    }

    return {
      ...document,
      actualSize: document.actualSize,
      etag: document.etag,
      confirmedAt: document.confirmedAt,
      consumedAt: document.consumedAt,
      consumedByType: document.consumedByType,
      consumedById: document.consumedById,
    };
  }

  private async findLinkedResourceOwner(
    tenantId: string,
    module: StorageModuleName,
    resourceId: string,
    path: string,
    access: TerritorialAccess,
  ): Promise<string | null> {
    if (module === StorageModuleName.FINANCE) {
      const entry = await this.prisma.financialEntry.findFirst({
        where: {
          id: resourceId,
          tenantId,
          evidenceUrl: path,
        },
        select: { reporterId: true },
      });
      return entry?.reporterId ?? null;
    }

    const report = await this.prisma.witnessReport.findFirst({
      where: {
        id: resourceId,
        tenantId,
        e14ImageUrl: path,
        ...(access.divisionIds === null
          ? {}
          : { puestoId: { in: access.divisionIds } }),
      },
      select: { witnessId: true },
    });
    return report?.witnessId ?? null;
  }

  private storageMetadataMatches(
    document: IntegrityDocument,
    currentObject: StoredObjectInfo,
  ): boolean {
    const size = this.currentObjectSize(currentObject);
    const contentType = this.currentObjectContentType(currentObject);
    return (
      currentObject.etag === document.etag &&
      size === document.actualSize &&
      contentType === document.contentType.toLowerCase()
    );
  }

  private assertTenantModuleAccess(
    tenant: CampaignTenantState | null | undefined,
    module: StorageModuleName,
  ): asserts tenant is CampaignTenantState {
    if (module === StorageModuleName.E14) {
      assertCandidacyCampaignTenant(tenant);
      return;
    }
    assertCampaignTenant(tenant);
  }

  private currentObjectSize(currentObject: StoredObjectInfo): number | null {
    const candidate =
      currentObject.size ??
      this.metadataValue(currentObject.metadata, [
        'size',
        'contentLength',
        'content-length',
      ]);
    const size = typeof candidate === 'string' ? Number(candidate) : candidate;
    return typeof size === 'number' && Number.isSafeInteger(size) && size > 0
      ? size
      : null;
  }

  private currentObjectContentType(
    currentObject: StoredObjectInfo,
  ): string | null {
    const candidate =
      currentObject.contentType ??
      this.metadataValue(currentObject.metadata, [
        'mimetype',
        'contentType',
        'content-type',
      ]);
    return typeof candidate === 'string' && candidate.trim()
      ? candidate.trim().toLowerCase()
      : null;
  }

  private metadataValue(
    metadata: Record<string, unknown> | undefined,
    keys: readonly string[],
  ): unknown {
    if (!metadata) return undefined;
    for (const key of keys) {
      if (metadata[key] !== undefined) return metadata[key];
    }
    return undefined;
  }

  private createBoundHash(
    tenantId: string,
    signerId: string,
    module: StorageModuleName,
    resourceType: string,
    resourceId: string,
    document: IntegrityDocument,
  ): string {
    const digest = createHash('sha256')
      .update('politica-sostenible:electronic-signature:v2')
      .update('\0')
      .update(tenantId)
      .update('\0')
      .update(signerId)
      .update('\0')
      .update(module)
      .update('\0')
      .update(resourceType)
      .update('\0')
      .update(resourceId)
      .update('\0')
      .update(document.id)
      .update('\0')
      .update(document.uploaderId)
      .update('\0')
      .update(document.contentType)
      .update('\0')
      .update(document.etag)
      .update('\0')
      .update(String(document.actualSize))
      .update('\0')
      .update(document.confirmedAt.toISOString())
      .update('\0')
      .update(document.consumedAt.toISOString())
      .digest('hex');

    return `${SIGNATURE_HASH_PREFIX}${digest}`;
  }

  private createLegacyHash(
    tenantId: string,
    document: IntegrityDocument,
  ): string {
    return createHash('sha256')
      .update(tenantId)
      .update('\0')
      .update(document.id)
      .update('\0')
      .update(document.etag)
      .update('\0')
      .update(String(document.actualSize))
      .update('\0')
      .update(document.confirmedAt.toISOString())
      .digest('hex');
  }

  private signatureHashMatches(
    storedHash: string,
    tenantId: string,
    signerId: string,
    module: StorageModuleName,
    resourceType: string,
    resourceId: string,
    document: IntegrityDocument,
  ): boolean {
    const expectedHash = storedHash.startsWith(SIGNATURE_HASH_PREFIX)
      ? this.createBoundHash(
          tenantId,
          signerId,
          module,
          resourceType,
          resourceId,
          document,
        )
      : this.createLegacyHash(tenantId, document);

    const stored = Buffer.from(storedHash, 'utf8');
    const expected = Buffer.from(expectedHash, 'utf8');
    return (
      stored.length === expected.length && timingSafeEqual(stored, expected)
    );
  }
}
