import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AuditActorType,
  CommunicationApprovalStatus,
  CommunicationChannel,
  PoliticalOperationMode,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { lockAndAssertCampaignOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import {
  COMMUNICATION_RECIPIENT_BASES,
  CreateCommunicationApprovalDto,
  type CommunicationRecipientBasis,
} from './dto/create-communication-approval.dto';
import { DecideCommunicationApprovalDto } from './dto/decide-communication-approval.dto';
import { ListCommunicationApprovalsQueryDto } from './dto/list-communication-approvals-query.dto';

const COMMUNICATION_INCLUDE = {
  requestedBy: { select: { id: true, name: true, role: true } },
  decidedBy: { select: { id: true, name: true, role: true } },
  issueCase: {
    select: { id: true, reference: true, status: true },
  },
} satisfies Prisma.CommunicationApprovalInclude;

const MODE_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.CASE_WORKER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
};

const MODE_REQUEST_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.CASE_WORKER,
  ],
};

const MODE_DECISION_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
};

const SENSITIVE_DECISION_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
];

const DIRECT_CHANNELS = new Set<CommunicationChannel>([
  CommunicationChannel.PHONE,
  CommunicationChannel.SMS,
  CommunicationChannel.WHATSAPP,
  CommunicationChannel.EMAIL,
  CommunicationChannel.LETTER,
]);

const PUBLIC_CHANNELS = new Set<CommunicationChannel>([
  CommunicationChannel.SOCIAL_MEDIA,
  CommunicationChannel.WEB,
  CommunicationChannel.IN_PERSON,
]);

const CASE_RESPONSE_CHANNELS = new Set<CommunicationChannel>([
  ...DIRECT_CHANNELS,
  CommunicationChannel.IN_PERSON,
]);

const MODE_CASE_LINK_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [Role.ADMIN, Role.CAMPAIGN_MANAGER],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: AuthenticatedUser,
    query: ListCommunicationApprovalsQueryDto,
  ) {
    const { mode } = await this.getActiveContext(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_READ_ROLES, 'consultar');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const isCaseWorker = user.role === Role.CASE_WORKER;

    if (
      isCaseWorker &&
      query.requestedById !== undefined &&
      query.requestedById !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso sólo pueden consultar sus propias solicitudes',
      );
    }

    const where: Prisma.CommunicationApprovalWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.entityId ? { id: query.entityId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.containsSensitiveData !== undefined
        ? { containsSensitiveData: query.containsSensitiveData === 'true' }
        : {}),
      ...(isCaseWorker
        ? { requestedById: user.userId }
        : query.requestedById
          ? { requestedById: query.requestedById }
          : {}),
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { purpose: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: new Date(query.createdFrom) }
                : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.communicationApproval.findMany({
        where,
        include: COMMUNICATION_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.communicationApproval.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(user: AuthenticatedUser, dto: CreateCommunicationApprovalDto) {
    const { mode, tenantType } = await this.getActiveContext(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_REQUEST_ROLES, 'solicitar');
    const title = dto.title.trim();
    const message = dto.message.trim();
    const purpose = dto.purpose.trim();
    const audienceDescription = dto.audienceDescription.trim();
    const dataSource = dto.dataSource.trim();
    const segmentationCriteria = dto.segmentationCriteria.trim();
    const rightsMechanismUrl = dto.rightsMechanismUrl?.trim();
    const consentEvidenceReference = dto.consentEvidenceReference?.trim();

    if (!title || !message || !purpose) {
      throw new BadRequestException(
        'El título, el mensaje y la finalidad no pueden quedar vacíos',
      );
    }

    if (!audienceDescription || !dataSource || !segmentationCriteria) {
      throw new BadRequestException(
        'La audiencia, la fuente de datos y los criterios de segmentación son obligatorios',
      );
    }

    this.assertCompliancePolicy({
      mode,
      tenantType,
      channel: dto.channel,
      recipientBasis: dto.recipientBasis,
      issueCaseId: dto.issueCaseId,
      containsSensitiveData: dto.containsSensitiveData ?? false,
      rightsMechanismUrl,
      consentEvidenceReference,
    });

    if (user.role === Role.CASE_WORKER && !dto.issueCaseId) {
      throw new BadRequestException(
        'Los gestores de caso deben relacionar la comunicación con un caso asignado',
      );
    }

    if (dto.issueCaseId) {
      this.assertModeRole(
        user.role,
        mode,
        MODE_CASE_LINK_ROLES,
        'relacionar casos con',
      );
    }

    await Promise.all([
      this.assertUserInTenant(user.tenantId, user.userId),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(
            user,
            mode,
            dto.issueCaseId,
            user.role === Role.CASE_WORKER,
          )
        : Promise.resolve(),
    ]);

    const content = {
      message,
      audienceDescription,
      dataSource,
      segmentationCriteria,
      recipientBasis: dto.recipientBasis,
      usesArtificialIntelligence: dto.usesArtificialIntelligence,
      ...(rightsMechanismUrl ? { rightsMechanismUrl } : {}),
      ...(consentEvidenceReference ? { consentEvidenceReference } : {}),
    } satisfies Prisma.InputJsonObject;
    const contentHash = this.hashContent(content);

    return this.prisma.$transaction(async (tx) => {
      await lockAndAssertCampaignOperationOpen(tx, user.tenantId, mode);
      const approval = await tx.communicationApproval.create({
        data: {
          tenantId: user.tenantId,
          mode,
          issueCaseId: dto.issueCaseId,
          channel: dto.channel,
          title,
          content,
          contentHash,
          purpose,
          containsSensitiveData: dto.containsSensitiveData ?? false,
          status: CommunicationApprovalStatus.PENDING,
          requestedById: user.userId,
        },
        include: COMMUNICATION_INCLUDE,
      });

      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'COMMUNICATION_REVIEW_REQUESTED',
          resourceType: 'CommunicationApproval',
          resourceId: approval.id,
          after: this.auditSnapshot(approval, {
            recipientBasis: dto.recipientBasis,
            usesArtificialIntelligence: dto.usesArtificialIntelligence,
            hasRightsMechanism: Boolean(rightsMechanismUrl),
            hasConsentEvidence: Boolean(consentEvidenceReference),
          }),
        },
      });

      return approval;
    });
  }

  async decide(
    user: AuthenticatedUser,
    id: string,
    dto: DecideCommunicationApprovalDto,
  ) {
    const { mode, tenantType } = await this.getActiveContext(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_DECISION_ROLES, 'decidir');
    await this.assertUserInTenant(user.tenantId, user.userId);
    const decisionReason = dto.decisionReason.trim();

    if (!decisionReason) {
      throw new BadRequestException('El motivo de la decisión es obligatorio');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockAndAssertCampaignOperationOpen(tx, user.tenantId, mode);
          const existing = await tx.communicationApproval.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: {
              id: true,
              title: true,
              purpose: true,
              status: true,
              requestedById: true,
              channel: true,
              containsSensitiveData: true,
              issueCaseId: true,
              contentHash: true,
              content: true,
            },
          });

          if (!existing) {
            throw new NotFoundException(
              'Solicitud de comunicación no encontrada',
            );
          }

          if (existing.status !== CommunicationApprovalStatus.PENDING) {
            throw new ConflictException(
              'La solicitud ya tiene una decisión final',
            );
          }

          if (existing.requestedById === user.userId) {
            throw new ForbiddenException(
              'La regla de cuatro ojos impide decidir su propia solicitud',
            );
          }

          if (
            existing.containsSensitiveData &&
            !SENSITIVE_DECISION_ROLES.includes(user.role as Role)
          ) {
            throw new ForbiddenException(
              'Las comunicaciones sensibles requieren revisión de administración o cumplimiento',
            );
          }

          if (dto.status === CommunicationApprovalStatus.APPROVED) {
            const compliance = this.readStoredCompliance(existing.content);
            if (this.hashContent(compliance.content) !== existing.contentHash) {
              throw new ConflictException(
                'La huella del contenido no coincide; rechace y cree una nueva solicitud',
              );
            }
            this.assertCompliancePolicy({
              mode,
              tenantType,
              channel: existing.channel,
              recipientBasis: compliance.recipientBasis,
              issueCaseId: existing.issueCaseId ?? undefined,
              containsSensitiveData: existing.containsSensitiveData,
              rightsMechanismUrl: compliance.rightsMechanismUrl,
              consentEvidenceReference: compliance.consentEvidenceReference,
            });
          }

          const decisionAt = new Date();
          const updateResult = await tx.communicationApproval.updateMany({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              status: CommunicationApprovalStatus.PENDING,
              requestedById: { not: user.userId },
            },
            data: {
              status: dto.status,
              decidedById: user.userId,
              decisionReason,
              decidedAt: decisionAt,
            },
          });

          if (updateResult.count !== 1) {
            throw new ConflictException(
              'La solicitud fue decidida por otra persona; actualice la cola',
            );
          }

          const updated = await tx.communicationApproval.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            include: COMMUNICATION_INCLUDE,
          });

          if (!updated) {
            throw new NotFoundException(
              'Solicitud de comunicación no encontrada',
            );
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'COMMUNICATION_REVIEW_DECIDED',
              resourceType: 'CommunicationApproval',
              resourceId: id,
              before: this.auditSnapshot(existing),
              after: this.auditSnapshot(updated),
              metadata: { decision: dto.status },
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La solicitud cambió durante la revisión; actualice la cola',
        );
      }
      throw error;
    }
  }

  private async getActiveContext(tenantId: string): Promise<{
    mode: PoliticalOperationMode;
    tenantType: TenantType;
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultMode: true, type: true },
    });

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    return { mode: tenant.defaultMode, tenantType: tenant.type };
  }

  private assertCompliancePolicy(input: {
    mode: PoliticalOperationMode;
    tenantType: TenantType;
    channel: CommunicationChannel;
    recipientBasis: CommunicationRecipientBasis;
    issueCaseId?: string;
    containsSensitiveData: boolean;
    rightsMechanismUrl?: string;
    consentEvidenceReference?: string;
  }): void {
    if (
      input.rightsMechanismUrl &&
      !this.isHttpsUrl(input.rightsMechanismUrl)
    ) {
      throw new BadRequestException(
        'El mecanismo para ejercer derechos debe usar una URL HTTPS válida',
      );
    }
    if (
      input.channel === CommunicationChannel.INTERNAL &&
      input.recipientBasis !== 'INTERNAL'
    ) {
      throw new BadRequestException(
        'El canal interno debe declarar una audiencia interna',
      );
    }
    if (
      input.recipientBasis === 'INTERNAL' &&
      input.channel !== CommunicationChannel.INTERNAL
    ) {
      throw new BadRequestException(
        'Una audiencia interna sólo puede usar el canal interno',
      );
    }
    if (
      input.recipientBasis === 'PUBLIC_AUDIENCE' &&
      !PUBLIC_CHANNELS.has(input.channel)
    ) {
      throw new BadRequestException(
        'Una audiencia pública no puede encubrir un envío directo a contactos',
      );
    }
    if (
      input.recipientBasis === 'DIRECT_OPT_IN' &&
      !DIRECT_CHANNELS.has(input.channel)
    ) {
      throw new BadRequestException(
        'La autorización directa sólo puede sustentar canales de contacto directo',
      );
    }
    if (
      input.recipientBasis === 'PARTY_MEMBERSHIP' &&
      input.tenantType !== TenantType.PARTY
    ) {
      throw new BadRequestException(
        'Sólo una organización configurada como partido puede invocar afiliación partidista',
      );
    }
    if (
      input.recipientBasis === 'CASE_RESPONSE' &&
      (input.mode !== PoliticalOperationMode.PUBLIC_OFFICE ||
        !input.issueCaseId)
    ) {
      throw new BadRequestException(
        'La respuesta de caso exige modo de gestión pública y un caso autorizado',
      );
    }
    if (
      input.recipientBasis === 'CASE_RESPONSE' &&
      !CASE_RESPONSE_CHANNELS.has(input.channel)
    ) {
      throw new BadRequestException(
        'La respuesta de caso debe ser directa o presencial; no puede publicarse como audiencia abierta',
      );
    }
    if (DIRECT_CHANNELS.has(input.channel)) {
      const allowedDirectBasis: CommunicationRecipientBasis[] = [
        'DIRECT_OPT_IN',
        'PARTY_MEMBERSHIP',
        'CASE_RESPONSE',
      ];
      if (!allowedDirectBasis.includes(input.recipientBasis)) {
        throw new BadRequestException(
          'El envío directo exige autorización, afiliación válida o respuesta a un caso',
        );
      }
      if (!input.rightsMechanismUrl) {
        throw new BadRequestException(
          'Los canales directos deben informar un mecanismo HTTPS para ejercer derechos o retirarse',
        );
      }
    }
    if (
      input.containsSensitiveData &&
      (input.recipientBasis === 'PUBLIC_AUDIENCE' ||
        input.channel === CommunicationChannel.SOCIAL_MEDIA ||
        input.channel === CommunicationChannel.WEB)
    ) {
      throw new BadRequestException(
        'No se pueden someter datos personales sensibles a publicación abierta',
      );
    }
    if (
      input.containsSensitiveData &&
      !['DIRECT_OPT_IN', 'CASE_RESPONSE'].includes(input.recipientBasis)
    ) {
      throw new BadRequestException(
        'Los datos sensibles requieren autorización expresa o un caso institucional autorizado',
      );
    }
    if (input.containsSensitiveData && !input.consentEvidenceReference) {
      throw new BadRequestException(
        'Los datos sensibles requieren una referencia verificable de autorización o soporte jurídico',
      );
    }
    if (
      input.recipientBasis === 'DIRECT_OPT_IN' &&
      !input.consentEvidenceReference
    ) {
      throw new BadRequestException(
        'La autorización directa requiere una referencia verificable de consentimiento, aunque no se declaren datos sensibles',
      );
    }
  }

  private readStoredCompliance(value: Prisma.JsonValue): {
    content: Prisma.InputJsonObject;
    recipientBasis: CommunicationRecipientBasis;
    rightsMechanismUrl?: string;
    consentEvidenceReference?: string;
  } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException(
        'La solicitud no contiene un expediente de cumplimiento aprobable',
      );
    }

    const content: Prisma.JsonObject = value;
    const requiredText = [
      content.message,
      content.audienceDescription,
      content.dataSource,
      content.segmentationCriteria,
    ];
    const recipientBasis = content.recipientBasis;
    if (
      requiredText.some(
        (item) => typeof item !== 'string' || item.trim().length < 3,
      ) ||
      typeof recipientBasis !== 'string' ||
      !COMMUNICATION_RECIPIENT_BASES.includes(
        recipientBasis as CommunicationRecipientBasis,
      ) ||
      typeof content.usesArtificialIntelligence !== 'boolean'
    ) {
      throw new BadRequestException(
        'La solicitud es anterior al expediente SIC completo; rechácela y cree una nueva versión',
      );
    }

    const rightsMechanismUrl = this.optionalStoredText(
      content.rightsMechanismUrl,
    );
    const consentEvidenceReference = this.optionalStoredText(
      content.consentEvidenceReference,
    );

    return {
      content: content as Prisma.InputJsonObject,
      recipientBasis: recipientBasis as CommunicationRecipientBasis,
      ...(rightsMechanismUrl ? { rightsMechanismUrl } : {}),
      ...(consentEvidenceReference ? { consentEvidenceReference } : {}),
    };
  }

  private optionalStoredText(
    value: Prisma.JsonValue | undefined,
  ): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private isHttpsUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  private assertModeRole(
    role: string | undefined,
    mode: PoliticalOperationMode,
    rolesByMode: Readonly<Record<PoliticalOperationMode, readonly Role[]>>,
    action: string,
  ): void {
    if (!rolesByMode[mode].includes(role as Role)) {
      throw new ForbiddenException(
        `Su rol no puede ${action} comunicaciones en el modo operativo actual`,
      );
    }
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException(
        'El usuario autenticado no pertenece a la organización actual',
      );
    }
  }

  private async assertIssueCaseInScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    issueCaseId: string,
    requireAssignment: boolean,
  ): Promise<void> {
    const issueCase = await this.prisma.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId: user.tenantId,
        mode,
        ...(requireAssignment ? { assigneeId: user.userId } : {}),
      },
      select: { id: true },
    });

    if (!issueCase) {
      throw new BadRequestException(
        'El caso relacionado no pertenece al alcance operativo autorizado',
      );
    }
  }

  private hashContent(content: Prisma.InputJsonObject): string {
    return createHash('sha256')
      .update(this.stableJson(content), 'utf8')
      .digest('hex');
  }

  private stableJson(value: Prisma.InputJsonValue): string {
    if (Array.isArray(value)) {
      return `[${value
        .map((item: Prisma.InputJsonValue) => this.stableJson(item))
        .join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableJson(item as Prisma.InputJsonValue)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private auditSnapshot(
    value: {
      title: string;
      purpose: string;
      status: CommunicationApprovalStatus;
      channel: string;
      containsSensitiveData: boolean;
      issueCaseId: string | null;
    },
    compliance?: {
      recipientBasis: CommunicationRecipientBasis;
      usesArtificialIntelligence: boolean;
      hasRightsMechanism: boolean;
      hasConsentEvidence: boolean;
    },
  ): Prisma.InputJsonObject {
    return {
      title: value.title,
      purpose: value.purpose,
      status: value.status,
      channel: value.channel,
      containsSensitiveData: value.containsSensitiveData,
      issueCaseId: value.issueCaseId,
      ...(compliance ? { compliance } : {}),
    };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
