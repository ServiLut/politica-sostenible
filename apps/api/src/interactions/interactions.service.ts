import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  InteractionDirection,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import {
  findActiveConsentNotice,
  getConsentPurposeForMode,
  requireActiveConsentNotice,
  type ConsentNoticeView,
} from '../common/utils/consent-notice.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { GrantCaseConsentDto } from './dto/grant-case-consent.dto';
import { ListInteractionsQueryDto } from './dto/list-interactions-query.dto';
import { RevokeCaseConsentDto } from './dto/revoke-case-consent.dto';

const INTERACTION_SELECT = {
  id: true,
  channel: true,
  direction: true,
  summary: true,
  outcome: true,
  sentiment: true,
  occurredAt: true,
  createdAt: true,
  actor: { select: { name: true, role: true } },
} satisfies Prisma.InteractionSelect;

const CASE_CONSENT_SELECT = {
  id: true,
  status: true,
  legalBasis: true,
  collectionChannel: true,
  noticeVersion: true,
  proofPath: true,
  grantedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ConsentRecordSelect;

type CaseConsentRecord = Prisma.ConsentRecordGetPayload<{
  select: typeof CASE_CONSENT_SELECT;
}>;

const MODE_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
};

const MODE_WRITE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

const ALL_INTERACTION_ROLES = [
  ...new Set([...Object.values(MODE_READ_ROLES).flat()]),
] as Role[];
const TERRITORIALLY_SCOPED_ROLES = [Role.ZONE_COORDINATOR] as const;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CASE_CONSENT_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
};

const CASE_CONSENT_GRANT_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [Role.ADMIN, Role.CAMPAIGN_MANAGER],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

const CASE_CONSENT_REVOKE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.COMPLIANCE_OFFICER,
  ],
};

interface InteractionAccess {
  role: Role;
  divisionIds: string[] | null;
}

interface InteractionCase {
  id: string;
  voterId: string | null;
  externalContactRef: string | null;
  createdAt: Date;
}

interface CaseConsentSubject {
  subjectType: ConsentSubjectType;
  subjectRef: string;
  voterId: string | null;
}

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentEvidence: ConsentEvidenceService,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListInteractionsQueryDto) {
    if (!query.issueCaseId && !query.voterId) {
      throw new BadRequestException(
        'Debe filtrar la bitacora por caso o ciudadano',
      );
    }

    const [mode, access] = await Promise.all([
      this.getActiveMode(this.prisma, user.tenantId),
      this.getCurrentAccess(this.prisma, user),
    ]);
    this.assertModeAccess(access.role, mode, 'read');
    await this.assertReadTargets(this.prisma, user, mode, access, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InteractionWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(query.voterId ? { voterId: query.voterId } : {}),
      ...this.buildReadScope(user, mode, access),
    };

    const [items, total] = await Promise.all([
      this.prisma.interaction.findMany({
        where,
        select: INTERACTION_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.interaction.count({ where }),
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

  async create(user: AuthenticatedUser, dto: CreateInteractionDto) {
    const now = new Date();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : now;
    if (occurredAt.getTime() > now.getTime() + MAX_FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException(
        'La fecha de la interaccion no puede estar en el futuro',
      );
    }

    this.assertChannelDirection(dto);
    const summary = dto.summary.trim();
    const outcome = dto.outcome?.trim();
    const externalContactRef = dto.externalContactRef?.trim();
    if (!summary) {
      throw new BadRequestException('El resumen no puede quedar vacio');
    }
    this.assertRequestedSubjectShape(dto, externalContactRef);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [mode, access] = await Promise.all([
            this.getActiveMode(tx, user.tenantId),
            this.getCurrentAccess(tx, user),
          ]);
          this.assertModeAccess(access.role, mode, 'write');

          if (
            mode === PoliticalOperationMode.CAMPAIGN &&
            dto.sentiment !== undefined
          ) {
            throw new BadRequestException(
              'La percepcion no puede registrarse en modo campana',
            );
          }

          if (access.role === Role.ZONE_COORDINATOR && dto.issueCaseId) {
            throw new ForbiddenException(
              'Los coordinadores zonales no pueden acceder a bitacoras de casos',
            );
          }

          const issueCase = dto.issueCaseId
            ? await this.findCaseInWriteScope(
                tx,
                user,
                mode,
                access,
                dto.issueCaseId,
              )
            : null;

          if (access.role === Role.CASE_WORKER && !issueCase) {
            throw new ForbiddenException(
              'Los gestores de caso deben registrar la interaccion en un caso asignado',
            );
          }

          if (issueCase) {
            this.assertCaseSubjectNotAmbiguous(issueCase);
            if (occurredAt.getTime() < issueCase.createdAt.getTime()) {
              throw new BadRequestException(
                'La fecha de la interaccion no puede ser anterior a la creacion del caso',
              );
            }
          }

          if (access.role === Role.ZONE_COORDINATOR && externalContactRef) {
            throw new ForbiddenException(
              'Los coordinadores zonales solo pueden registrar interacciones de ciudadanos en su territorio',
            );
          }

          const voterId = issueCase?.voterId ?? dto.voterId ?? undefined;
          const resolvedExternalContactRef = issueCase
            ? (issueCase.externalContactRef ?? undefined)
            : externalContactRef;

          if (voterId) {
            await this.assertVoterInWriteScope(tx, user, access, voterId);
          }

          let consentRecordId: string | undefined;
          if (dto.direction === InteractionDirection.OUTBOUND) {
            if (!voterId && !resolvedExternalContactRef) {
              throw new BadRequestException(
                'Una interaccion saliente requiere una persona relacionada',
              );
            }
            consentRecordId = await this.requireCurrentConsent(
              tx,
              user.tenantId,
              mode,
              voterId,
              resolvedExternalContactRef,
              occurredAt,
              now,
            );
          }

          const interaction = await tx.interaction.create({
            data: {
              tenantId: user.tenantId,
              mode,
              issueCaseId: issueCase?.id,
              voterId,
              externalContactRef: resolvedExternalContactRef,
              actorId: user.userId,
              consentRecordId,
              channel: dto.channel,
              direction: dto.direction,
              summary,
              outcome: outcome || undefined,
              sentiment: dto.sentiment,
              occurredAt,
            },
            select: INTERACTION_SELECT,
          });

          if (issueCase && dto.direction === InteractionDirection.OUTBOUND) {
            await tx.issueCase.updateMany({
              where: {
                id: issueCase.id,
                tenantId: user.tenantId,
                mode,
                OR: [
                  { firstResponseAt: null },
                  { firstResponseAt: { gt: occurredAt } },
                ],
              },
              data: { firstResponseAt: occurredAt },
            });
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'INTERACTION_RECORDED',
              resourceType: 'Interaction',
              resourceId: interaction.id,
              after: {
                channel: dto.channel,
                direction: dto.direction,
                issueCaseId: issueCase?.id ?? null,
                consentVerified: Boolean(consentRecordId),
                occurredAt: occurredAt.toISOString(),
              },
            },
          });

          return interaction;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La bitacora cambio durante el registro; intente nuevamente',
        );
      }
      throw error;
    }
  }

  async getCaseConsentStatus(user: AuthenticatedUser, issueCaseId: string) {
    const [mode, access] = await Promise.all([
      this.getActiveMode(this.prisma, user.tenantId),
      this.getCurrentAccess(this.prisma, user),
    ]);
    this.assertCaseConsentAccess(access.role, mode, 'read');

    const issueCase = await this.findCaseInConsentScope(
      this.prisma,
      user,
      mode,
      access.role,
      issueCaseId,
    );
    const subject = this.resolveCaseSubject(issueCase, mode);
    const purpose = this.getConsentPurpose(mode);
    const [consent, currentNotice] = await Promise.all([
      this.findLatestCaseConsent(
        this.prisma,
        user.tenantId,
        mode,
        purpose,
        subject,
      ),
      findActiveConsentNotice(this.prisma, user.tenantId, mode, purpose),
    ]);

    return this.toCaseConsentStatus(
      issueCase.id,
      purpose,
      subject,
      consent,
      new Date(),
      currentNotice,
    );
  }

  async grantCaseConsent(
    user: AuthenticatedUser,
    sourceIp: string,
    dto: GrantCaseConsentDto,
  ) {
    if (dto.collectionChannel === ConsentCollectionChannel.IMPORT) {
      throw new BadRequestException(
        'La captura importada requiere una evidencia verificada y no esta disponible en este flujo',
      );
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('La fecha de expiracion no es valida');
    }
    const sourceIpHash = this.consentEvidence.hashIp(sourceIp);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [mode, access] = await Promise.all([
            this.getActiveMode(tx, user.tenantId),
            this.getCurrentAccess(tx, user),
          ]);
          this.assertCaseConsentAccess(access.role, mode, 'grant');

          const grantedAt = new Date();
          if (expiresAt && expiresAt.getTime() <= grantedAt.getTime()) {
            throw new BadRequestException(
              'La expiracion debe ser posterior a la autorizacion',
            );
          }

          const issueCase = await this.findCaseInConsentScope(
            tx,
            user,
            mode,
            access.role,
            dto.issueCaseId,
          );
          const subject = this.resolveCaseSubject(issueCase, mode);
          const purpose = this.getConsentPurpose(mode);
          const currentNotice = await requireActiveConsentNotice(
            tx,
            user.tenantId,
            mode,
            dto.noticeVersion,
            purpose,
          );
          const latest = await this.findLatestCaseConsent(
            tx,
            user.tenantId,
            mode,
            purpose,
            subject,
          );

          if (this.isConsentActive(latest, grantedAt, currentNotice.version)) {
            throw new ConflictException(
              'El caso ya tiene una autorizacion vigente para esta finalidad',
            );
          }
          const latestEffectiveAt = latest?.revokedAt ?? latest?.createdAt;
          if (
            latestEffectiveAt &&
            grantedAt.getTime() <= latestEffectiveAt.getTime()
          ) {
            throw new BadRequestException(
              'La nueva autorizacion debe ser posterior al ultimo evento de consentimiento',
            );
          }

          const consent = await tx.consentRecord.create({
            data: {
              tenantId: user.tenantId,
              mode,
              subjectType: subject.subjectType,
              subjectRef: subject.subjectRef,
              voterId: subject.voterId,
              purpose,
              legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
              status: ConsentStatus.GRANTED,
              collectionChannel: dto.collectionChannel,
              noticeVersion: currentNotice.version,
              sourceIpHash,
              capturedById: user.userId,
              grantedAt,
              expiresAt,
            },
            select: CASE_CONSENT_SELECT,
          });

          if (this.shouldSyncCampaignVoterConsent(mode, purpose, subject)) {
            await tx.voter.update({
              where: {
                id: subject.voterId as string,
                tenantId: user.tenantId,
              },
              data: {
                consentAccepted: true,
                consentTimestamp: grantedAt,
                termsVersion: currentNotice.version,
                consentIp: sourceIpHash,
              },
            });
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'CASE_FOLLOW_UP_CONSENT_GRANTED',
              resourceType: 'ConsentRecord',
              resourceId: consent.id,
              after: {
                status: ConsentStatus.GRANTED,
                issueCaseId: issueCase.id,
                purpose,
                subjectType: subject.subjectType,
                legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
                collectionChannel: dto.collectionChannel,
                noticeVersion: currentNotice.version,
                grantedAt: grantedAt.toISOString(),
                expiresAt: expiresAt?.toISOString() ?? null,
              },
            },
          });

          return this.toCaseConsentStatus(
            issueCase.id,
            purpose,
            subject,
            consent,
            grantedAt,
            currentNotice,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El consentimiento cambio durante la captura; consulta su estado actual',
        );
      }
      throw error;
    }
  }

  async revokeCaseConsent(
    user: AuthenticatedUser,
    sourceIp: string,
    dto: RevokeCaseConsentDto,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      throw new BadRequestException(
        'El motivo de revocacion debe tener entre 10 y 500 caracteres',
      );
    }
    const now = new Date();
    const sourceIpHash = this.consentEvidence.hashIp(sourceIp);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [mode, access] = await Promise.all([
            this.getActiveMode(tx, user.tenantId),
            this.getCurrentAccess(tx, user),
          ]);
          this.assertCaseConsentAccess(access.role, mode, 'revoke');

          const issueCase = await this.findCaseInConsentScope(
            tx,
            user,
            mode,
            access.role,
            dto.issueCaseId,
          );
          const subject = this.resolveCaseSubject(issueCase, mode);
          const purpose = this.getConsentPurpose(mode);
          const [latest, currentNotice] = await Promise.all([
            this.findLatestCaseConsent(
              tx,
              user.tenantId,
              mode,
              purpose,
              subject,
            ),
            findActiveConsentNotice(tx, user.tenantId, mode, purpose),
          ]);

          if (!latest || latest.status !== ConsentStatus.GRANTED) {
            throw new ConflictException(
              'No existe una autorizacion vigente para revocar',
            );
          }

          const revocation = await tx.consentRecord.create({
            data: {
              tenantId: user.tenantId,
              mode,
              subjectType: subject.subjectType,
              subjectRef: subject.subjectRef,
              voterId: subject.voterId,
              purpose,
              legalBasis: latest.legalBasis,
              status: ConsentStatus.REVOKED,
              collectionChannel: latest.collectionChannel,
              noticeVersion: latest.noticeVersion,
              proofPath: latest.proofPath,
              sourceIpHash,
              capturedById: user.userId,
              grantedAt: latest.grantedAt,
              expiresAt: latest.expiresAt,
              revokedAt: now,
              revocationReason: reason,
            },
            select: CASE_CONSENT_SELECT,
          });

          if (this.shouldSyncCampaignVoterConsent(mode, purpose, subject)) {
            await tx.voter.update({
              where: {
                id: subject.voterId as string,
                tenantId: user.tenantId,
              },
              data: { consentAccepted: false },
            });
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'CASE_FOLLOW_UP_CONSENT_REVOKED',
              resourceType: 'ConsentRecord',
              resourceId: revocation.id,
              before: {
                status: ConsentStatus.GRANTED,
              },
              after: {
                status: ConsentStatus.REVOKED,
                issueCaseId: issueCase.id,
                purpose,
                subjectType: subject.subjectType,
                revokedAt: now.toISOString(),
              },
            },
          });

          return this.toCaseConsentStatus(
            issueCase.id,
            purpose,
            subject,
            revocation,
            now,
            currentNotice,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El consentimiento cambio durante la revocacion; consulta su estado actual',
        );
      }
      throw error;
    }
  }

  private buildReadScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: InteractionAccess,
  ): Prisma.InteractionWhereInput {
    if (access.role === Role.CASE_WORKER) {
      return {
        issueCase: {
          is: {
            tenantId: user.tenantId,
            mode,
            assigneeId: user.userId,
          },
        },
      };
    }

    if (access.role === Role.ZONE_COORDINATOR) {
      const divisionIds = access.divisionIds ?? [];
      return {
        issueCaseId: null,
        voter: {
          is: {
            tenantId: user.tenantId,
            puestoId: { in: divisionIds },
          },
        },
      };
    }

    return {};
  }

  private async assertReadTargets(
    client: PrismaService | Prisma.TransactionClient,
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: InteractionAccess,
    query: ListInteractionsQueryDto,
  ): Promise<void> {
    if (access.role === Role.ZONE_COORDINATOR && query.issueCaseId) {
      throw new ForbiddenException(
        'Los coordinadores zonales no pueden acceder a bitacoras de casos',
      );
    }

    const issueCase = query.issueCaseId
      ? await client.issueCase.findFirst({
          where: {
            id: query.issueCaseId,
            tenantId: user.tenantId,
            mode,
            ...(access.role === Role.CASE_WORKER
              ? { assigneeId: user.userId }
              : {}),
          },
          select: { id: true, voterId: true },
        })
      : null;

    if (query.issueCaseId && !issueCase) {
      throw new NotFoundException(
        'Caso no encontrado dentro del alcance autorizado',
      );
    }

    const voter = query.voterId
      ? await client.voter.findFirst({
          where: {
            id: query.voterId,
            tenantId: user.tenantId,
            ...(access.role === Role.ZONE_COORDINATOR
              ? { puestoId: { in: access.divisionIds ?? [] } }
              : access.role === Role.CASE_WORKER
                ? {
                    issueCases: {
                      some: {
                        tenantId: user.tenantId,
                        mode,
                        assigneeId: user.userId,
                      },
                    },
                  }
                : {}),
          },
          select: { id: true },
        })
      : null;

    if (query.voterId && !voter) {
      throw new NotFoundException(
        'Ciudadano no encontrado dentro del alcance autorizado',
      );
    }

    if (issueCase && query.voterId && issueCase.voterId !== query.voterId) {
      throw new BadRequestException(
        'El ciudadano consultado no corresponde al caso indicado',
      );
    }
  }

  private async findCaseInWriteScope(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: InteractionAccess,
    issueCaseId: string,
  ): Promise<InteractionCase> {
    const issueCase = await tx.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId: user.tenantId,
        mode,
        ...(access.role === Role.CASE_WORKER
          ? { assigneeId: user.userId }
          : {}),
      },
      select: {
        id: true,
        voterId: true,
        externalContactRef: true,
        createdAt: true,
      },
    });

    if (!issueCase) {
      throw new NotFoundException(
        'Caso no encontrado dentro del alcance autorizado',
      );
    }

    return issueCase;
  }

  private async assertVoterInWriteScope(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    access: InteractionAccess,
    voterId: string,
  ): Promise<void> {
    const voter = await tx.voter.findFirst({
      where: {
        id: voterId,
        tenantId: user.tenantId,
        ...(access.role === Role.ZONE_COORDINATOR
          ? { puestoId: { in: access.divisionIds ?? [] } }
          : {}),
      },
      select: { id: true },
    });

    if (!voter) {
      throw new NotFoundException(
        'Ciudadano no encontrado dentro del alcance autorizado',
      );
    }
  }

  private async findCaseInConsentScope(
    client: PrismaService | Prisma.TransactionClient,
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    role: Role,
    issueCaseId: string,
  ): Promise<InteractionCase> {
    const issueCase = await client.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId: user.tenantId,
        mode,
        ...(role === Role.CASE_WORKER ? { assigneeId: user.userId } : {}),
      },
      select: {
        id: true,
        voterId: true,
        externalContactRef: true,
        createdAt: true,
      },
    });

    if (!issueCase) {
      throw new NotFoundException(
        'Caso no encontrado dentro del alcance autorizado',
      );
    }

    return issueCase;
  }

  private findLatestCaseConsent(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    mode: PoliticalOperationMode,
    purpose: ConsentPurpose,
    subject: CaseConsentSubject,
  ): Promise<CaseConsentRecord | null> {
    return client.consentRecord.findFirst({
      where: {
        tenantId,
        mode,
        purpose,
        subjectType: subject.subjectType,
        subjectRef: subject.subjectRef,
        voterId: subject.voterId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: CASE_CONSENT_SELECT,
    });
  }

  private toCaseConsentStatus(
    issueCaseId: string,
    purpose: ConsentPurpose,
    subject: CaseConsentSubject,
    consent: CaseConsentRecord | null,
    checkedAt: Date,
    currentNotice: ConsentNoticeView | null,
  ) {
    let status: ConsentStatus | null = consent?.status ?? null;
    if (consent?.revokedAt || status === ConsentStatus.REVOKED) {
      status = ConsentStatus.REVOKED;
    } else if (
      status === ConsentStatus.GRANTED &&
      consent?.expiresAt &&
      consent.expiresAt.getTime() <= checkedAt.getTime()
    ) {
      status = ConsentStatus.EXPIRED;
    }

    return {
      issueCaseId,
      purpose,
      subjectType: subject.subjectType,
      status,
      active: this.isConsentActive(consent, checkedAt, currentNotice?.version),
      requiresReconsent: Boolean(
        consent?.status === ConsentStatus.GRANTED &&
        consent.noticeVersion !== currentNotice?.version,
      ),
      currentNotice,
      consentRecordId: consent?.id ?? null,
      legalBasis: consent?.legalBasis ?? null,
      collectionChannel: consent?.collectionChannel ?? null,
      noticeVersion: consent?.noticeVersion ?? null,
      grantedAt: consent?.grantedAt ?? null,
      expiresAt: consent?.expiresAt ?? null,
      revokedAt: consent?.revokedAt ?? null,
      recordedAt: consent?.createdAt ?? null,
    };
  }

  private isConsentActive(
    consent: CaseConsentRecord | null,
    checkedAt: Date,
    currentNoticeVersion?: string,
  ): boolean {
    return Boolean(
      consent &&
      consent.status === ConsentStatus.GRANTED &&
      consent.noticeVersion === currentNoticeVersion &&
      !consent.revokedAt &&
      consent.grantedAt.getTime() <= checkedAt.getTime() &&
      (!consent.expiresAt || consent.expiresAt.getTime() > checkedAt.getTime()),
    );
  }

  private getConsentPurpose(mode: PoliticalOperationMode): ConsentPurpose {
    return getConsentPurposeForMode(mode);
  }

  private shouldSyncCampaignVoterConsent(
    mode: PoliticalOperationMode,
    purpose: ConsentPurpose,
    subject: CaseConsentSubject,
  ): boolean {
    return (
      mode === PoliticalOperationMode.CAMPAIGN &&
      purpose === ConsentPurpose.POLITICAL_COMMUNICATION &&
      subject.subjectType === ConsentSubjectType.VOTER &&
      Boolean(subject.voterId)
    );
  }

  private assertCaseConsentAccess(
    role: Role,
    mode: PoliticalOperationMode,
    access: 'read' | 'grant' | 'revoke',
  ): void {
    const allowed =
      access === 'read'
        ? CASE_CONSENT_READ_ROLES[mode]
        : access === 'grant'
          ? CASE_CONSENT_GRANT_ROLES[mode]
          : CASE_CONSENT_REVOKE_ROLES[mode];

    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        'Su rol no puede administrar el consentimiento del caso en el modo activo',
      );
    }
  }

  private assertRequestedSubjectShape(
    dto: CreateInteractionDto,
    externalContactRef: string | undefined,
  ): void {
    if (dto.issueCaseId) {
      if (dto.voterId || externalContactRef) {
        throw new BadRequestException(
          'El ciudadano de una interaccion ligada a un caso se deriva exclusivamente del caso',
        );
      }
      return;
    }

    const subjectCount =
      Number(Boolean(dto.voterId)) + Number(Boolean(externalContactRef));
    if (subjectCount !== 1) {
      throw new BadRequestException(
        'Una interaccion sin caso requiere exactamente un ciudadano o contacto externo',
      );
    }
  }

  private resolveCaseSubject(
    issueCase: InteractionCase,
    mode: PoliticalOperationMode,
  ): CaseConsentSubject {
    this.assertCaseSubjectNotAmbiguous(issueCase);
    if (!issueCase.voterId && !issueCase.externalContactRef) {
      throw new BadRequestException(
        'El caso debe tener un ciudadano o contacto externo relacionado',
      );
    }

    if (issueCase.voterId) {
      return {
        subjectType: ConsentSubjectType.VOTER,
        subjectRef: issueCase.voterId,
        voterId: issueCase.voterId,
      };
    }

    return {
      subjectType:
        mode === PoliticalOperationMode.PUBLIC_OFFICE
          ? ConsentSubjectType.CITIZEN
          : ConsentSubjectType.OTHER,
      subjectRef: issueCase.externalContactRef as string,
      voterId: null,
    };
  }

  private assertCaseSubjectNotAmbiguous(issueCase: InteractionCase): void {
    if (issueCase.voterId && issueCase.externalContactRef) {
      throw new BadRequestException(
        'El caso tiene una identidad ambigua y debe corregirse antes de registrar gestiones',
      );
    }
  }

  private async requireCurrentConsent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    mode: PoliticalOperationMode,
    voterId: string | undefined,
    externalContactRef: string | undefined,
    occurredAt: Date,
    checkedAt: Date,
  ): Promise<string> {
    const purpose =
      mode === PoliticalOperationMode.CAMPAIGN
        ? ConsentPurpose.POLITICAL_COMMUNICATION
        : ConsentPurpose.SERVICE_FOLLOW_UP;

    const consent = await tx.consentRecord.findFirst({
      where: {
        tenantId,
        mode,
        purpose,
        ...(voterId
          ? {
              voterId,
              subjectType: ConsentSubjectType.VOTER,
              subjectRef: voterId,
            }
          : {
              subjectType:
                mode === PoliticalOperationMode.PUBLIC_OFFICE
                  ? ConsentSubjectType.CITIZEN
                  : ConsentSubjectType.OTHER,
              subjectRef: externalContactRef,
              voterId: null,
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        noticeVersion: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const isGrantedBeforeInteraction = Boolean(
      consent && consent.grantedAt.getTime() <= occurredAt.getTime(),
    );
    const isCurrentlyEffective = Boolean(
      consent && consent.grantedAt.getTime() <= checkedAt.getTime(),
    );
    const isUnexpired =
      !consent?.expiresAt || consent.expiresAt.getTime() > checkedAt.getTime();
    const currentNotice = await findActiveConsentNotice(
      tx,
      tenantId,
      mode,
      purpose,
    );

    if (
      !consent ||
      consent.status !== ConsentStatus.GRANTED ||
      consent.revokedAt ||
      !currentNotice ||
      consent.noticeVersion !== currentNotice.version ||
      !isGrantedBeforeInteraction ||
      !isCurrentlyEffective ||
      !isUnexpired
    ) {
      throw new ForbiddenException(
        `No existe consentimiento vigente para la finalidad ${purpose}`,
      );
    }

    return consent.id;
  }

  private assertChannelDirection(dto: CreateInteractionDto): void {
    const isInternalDirection = dto.direction === InteractionDirection.INTERNAL;
    const isInternalChannel = dto.channel === 'INTERNAL';
    if (isInternalDirection !== isInternalChannel) {
      throw new BadRequestException(
        'El canal INTERNAL solo puede usarse con direccion INTERNAL',
      );
    }
  }

  private assertModeAccess(
    role: Role,
    mode: PoliticalOperationMode,
    access: 'read' | 'write',
  ): void {
    const allowed =
      access === 'write' ? MODE_WRITE_ROLES[mode] : MODE_READ_ROLES[mode];
    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        access === 'write'
          ? 'Su rol no puede registrar interacciones en el modo activo'
          : 'Su rol no puede consultar interacciones en el modo activo',
      );
    }
  }

  private getCurrentAccess(
    client: PrismaService | Prisma.TransactionClient,
    user: AuthenticatedUser,
  ): Promise<InteractionAccess> {
    return resolveTerritorialAccess({
      client,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: ALL_INTERACTION_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_ROLES,
    });
  }

  private async getActiveMode(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ): Promise<PoliticalOperationMode> {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultMode: true },
    });

    if (!tenant) {
      throw new NotFoundException('Organizacion no encontrada');
    }

    return tenant.defaultMode;
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
