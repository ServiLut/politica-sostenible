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
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ListVotersQueryDto } from './dto/list-voters-query.dto';
import { RevokeVoterConsentDto } from './dto/revoke-voter-consent.dto';

const CONSENT_REVOKE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
] as const;

export const VOTER_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
] as const;

const VOTER_TERRITORIALLY_SCOPED_ROLES = [Role.ZONE_COORDINATOR] as const;
const VOTER_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
] as const;
const VOTER_WRITE_TERRITORIALLY_SCOPED_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
] as const;
const VOTER_CAPTURE_RECEIPT = { received: true } as const;

const VOTER_LIST_SELECT = {
  id: true,
  documentId: true,
  firstName: true,
  lastName: true,
  phone: true,
  mesa: true,
  isSignatureValid: true,
  consentAccepted: true,
  consentTimestamp: true,
  createdAt: true,
  puesto: { select: { name: true } },
  registrar: { select: { name: true } },
} satisfies Prisma.VoterSelect;

type VoterListSource = Prisma.VoterGetPayload<{
  select: typeof VOTER_LIST_SELECT;
}>;

@Injectable()
export class VoterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentEvidence: ConsentEvidenceService,
  ) {}

  async create(
    user: AuthenticatedUser,
    consentIp: string,
    dto: CreateVoterDto,
  ) {
    if (dto.consentAccepted !== true) {
      throw new BadRequestException(
        'Se requiere consentimiento expreso para registrar al ciudadano',
      );
    }

    const { consentAccepted, termsVersion, ...voterData } = dto;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: user.tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const { divisionIds } = await resolveTerritorialAccess({
          client: transaction,
          tenantId: user.tenantId,
          userId: user.userId,
          allowedRoles: VOTER_WRITE_ROLES,
          territoriallyScopedRoles: VOTER_WRITE_TERRITORIALLY_SCOPED_ROLES,
        });

        if (divisionIds !== null) {
          if (!voterData.puestoId) {
            throw new BadRequestException(
              'El registro requiere un puesto dentro de la asignación territorial',
            );
          }
          if (!divisionIds.includes(voterData.puestoId)) {
            throw new ForbiddenException(
              'El puesto no pertenece a la asignación territorial del usuario',
            );
          }
        }

        if (voterData.puestoId) {
          const puesto = await transaction.politicalDivision.findFirst({
            where: {
              id: voterData.puestoId,
              tenantId: user.tenantId,
              type: DivisionType.PUESTO,
            },
            select: { id: true },
          });

          if (!puesto) {
            throw new BadRequestException(
              'Puesto de votación inválido para la campaña autenticada',
            );
          }
        }

        const existingVoter = await transaction.voter.findUnique({
          where: {
            documentId_tenantId: {
              documentId: dto.documentId,
              tenantId: user.tenantId,
            },
          },
          select: { id: true },
        });

        if (existingVoter) return VOTER_CAPTURE_RECEIPT;

        const grantedAt = new Date();
        const sourceIpHash = this.consentEvidence.hashIp(consentIp);
        const voter = await transaction.voter.create({
          data: {
            ...voterData,
            tenantId: user.tenantId,
            registrarId: user.userId,
            consentAccepted,
            consentIp: sourceIpHash,
            consentTimestamp: grantedAt,
            termsVersion,
          },
          select: { id: true },
        });

        await transaction.consentRecord.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            subjectType: ConsentSubjectType.VOTER,
            subjectRef: voter.id,
            voterId: voter.id,
            purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
            legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
            status: ConsentStatus.GRANTED,
            collectionChannel: ConsentCollectionChannel.IN_PERSON,
            noticeVersion: termsVersion,
            sourceIpHash,
            capturedById: user.userId,
            grantedAt,
          },
        });

        return VOTER_CAPTURE_RECEIPT;
      });
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) return VOTER_CAPTURE_RECEIPT;
      throw error;
    }
  }

  async findAll(user: AuthenticatedUser, query: ListVotersQueryDto) {
    await this.assertCampaignMode(user.tenantId);
    const { divisionIds } = await resolveTerritorialAccess({
      client: this.prisma,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: VOTER_READ_ROLES,
      territoriallyScopedRoles: VOTER_TERRITORIALLY_SCOPED_ROLES,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.VoterWhereInput = {
      tenantId: user.tenantId,
      ...(divisionIds ? { puestoId: { in: divisionIds } } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [voters, total] = await Promise.all([
      this.prisma.voter.findMany({
        where,
        select: VOTER_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.voter.count({ where }),
    ]);

    return {
      items: voters.map((voter) => this.toVoterListItem(voter)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async revokeConsent(
    user: AuthenticatedUser,
    voterId: string,
    dto: RevokeVoterConsentDto,
  ) {
    this.assertConsentRevokeRole(user);
    const reason = dto.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      throw new BadRequestException(
        'El motivo de revocacion debe tener entre 10 y 500 caracteres',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const tenant = await transaction.tenant.findUnique({
            where: { id: user.tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          });
          assertCampaignTenant(tenant);

          const voter = await transaction.voter.findFirst({
            where: { id: voterId, tenantId: user.tenantId },
            select: { id: true, consentAccepted: true },
          });
          if (!voter) {
            throw new NotFoundException('Ciudadano no encontrado');
          }

          const latestConsent = await transaction.consentRecord.findFirst({
            where: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              voterId,
              subjectType: ConsentSubjectType.VOTER,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          });

          if (
            !latestConsent ||
            latestConsent.status !== ConsentStatus.GRANTED
          ) {
            throw new ConflictException(
              latestConsent?.status === ConsentStatus.REVOKED
                ? 'El consentimiento ya fue revocado'
                : 'No existe un consentimiento vigente para revocar',
            );
          }

          const revokedAt = new Date();
          const revocation = await transaction.consentRecord.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              subjectType: ConsentSubjectType.VOTER,
              subjectRef: latestConsent.subjectRef,
              voterId,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              legalBasis: latestConsent.legalBasis,
              status: ConsentStatus.REVOKED,
              collectionChannel: latestConsent.collectionChannel,
              noticeVersion: latestConsent.noticeVersion,
              capturedById: user.userId,
              grantedAt: latestConsent.grantedAt,
              revokedAt,
              revocationReason: reason,
            },
            select: { id: true, status: true, revokedAt: true },
          });

          const voterState = await transaction.voter.update({
            where: { id: voterId, tenantId: user.tenantId },
            data: { consentAccepted: false },
            select: { id: true, consentAccepted: true },
          });

          await transaction.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'VOTER_CONSENT_REVOKED',
              resourceType: 'ConsentRecord',
              resourceId: revocation.id,
              before: {
                status: ConsentStatus.GRANTED,
                consentAccepted: voter.consentAccepted,
              },
              after: {
                status: ConsentStatus.REVOKED,
                consentAccepted: false,
              },
              metadata: {
                purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              },
            },
          });

          return {
            voterId: voterState.id,
            consentAccepted: voterState.consentAccepted,
            status: revocation.status,
            revokedAt: revocation.revokedAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El consentimiento cambio durante la solicitud; consulta su estado actual',
        );
      }
      throw error;
    }
  }

  async getStats(user: AuthenticatedUser) {
    await this.assertCampaignMode(user.tenantId);
    const { divisionIds } = await resolveTerritorialAccess({
      client: this.prisma,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: VOTER_READ_ROLES,
      territoriallyScopedRoles: VOTER_TERRITORIALLY_SCOPED_ROLES,
    });
    const where: Prisma.VoterWhereInput = {
      tenantId: user.tenantId,
      ...(divisionIds ? { puestoId: { in: divisionIds } } : {}),
    };
    const [total, signatures, consented] = await Promise.all([
      this.prisma.voter.count({ where }),
      this.prisma.voter.count({ where: { ...where, isSignatureValid: true } }),
      this.prisma.voter.count({ where: { ...where, consentAccepted: true } }),
    ]);

    return { total, signatures, consented };
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }

  private assertConsentRevokeRole(user: AuthenticatedUser): void {
    if (
      !CONSENT_REVOKE_ROLES.includes(
        user.role as (typeof CONSENT_REVOKE_ROLES)[number],
      )
    ) {
      throw new ForbiddenException(
        'Su rol no puede revocar consentimientos electorales',
      );
    }
  }

  private toVoterListItem(voter: VoterListSource) {
    return {
      id: voter.id,
      firstName: voter.firstName,
      lastName: voter.lastName,
      documentIdMasked: this.maskSensitiveValue(voter.documentId),
      phoneMasked: voter.phone ? this.maskSensitiveValue(voter.phone) : null,
      mesa: voter.mesa,
      isSignatureValid: voter.isSignatureValid,
      consentAccepted: voter.consentAccepted,
      consentTimestamp: voter.consentTimestamp,
      createdAt: voter.createdAt,
      puesto: voter.puesto,
      registrar: voter.registrar,
    };
  }

  private maskSensitiveValue(value: string): string {
    if (value.length <= 4) {
      return '*'.repeat(Math.max(value.length, 4));
    }

    return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
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
