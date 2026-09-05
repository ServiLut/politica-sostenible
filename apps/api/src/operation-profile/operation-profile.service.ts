import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  CandidateListType,
  ElectoralCircumscriptionType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  getOperationProfileCoherenceError,
  UpsertOperationProfileDto,
} from './dto/upsert-operation-profile.dto';

const DATA_RESPONSIBLE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];

const PROFILE_SELECT = {
  id: true,
  tenantId: true,
  operationType: true,
  stage: true,
  electionType: true,
  circumscriptionType: true,
  circumscriptionName: true,
  circumscriptionCode: true,
  listType: true,
  electionDate: true,
  expectedTeamSize: true,
  candidateCount: true,
  dataControllerName: true,
  responsibleDataUserId: true,
  retentionPeriodDays: true,
  revocationProcedure: true,
  responsibleDataUser: {
    select: { id: true, name: true, role: true },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OperationProfileSelect;

const SETTINGS_SELECT = {
  maxTotalBudget: true,
  maxPublicityLimit: true,
} satisfies Prisma.CampaignSettingsSelect;

type SelectedProfile = Prisma.OperationProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

type SelectedSettings = Prisma.CampaignSettingsGetPayload<{
  select: typeof SETTINGS_SELECT;
}>;

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

@Injectable()
export class OperationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(user: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [tenant, profile, settings] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: user.tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          }),
          transaction.operationProfile.findUnique({
            where: { tenantId: user.tenantId },
            select: PROFILE_SELECT,
          }),
          transaction.campaignSettings.findUnique({
            where: { tenantId: user.tenantId },
            select: SETTINGS_SELECT,
          }),
        ]);
        assertCampaignTenant(tenant);

        if (!profile) {
          return { configured: false, profile: null };
        }
        if (!settings) {
          throw new ConflictException(
            'La configuracion politica esta incompleta: falta el presupuesto de campana',
          );
        }

        return this.toContext(profile, settings);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }

  async upsert(user: AuthenticatedUser, dto: UpsertOperationProfileDto) {
    const coherenceError = getOperationProfileCoherenceError(dto);
    if (coherenceError) {
      throw new BadRequestException(coherenceError);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [tenant, actor, responsible, currentProfile, currentSettings] =
          await Promise.all([
            transaction.tenant.findUnique({
              where: { id: user.tenantId },
              select: CAMPAIGN_TENANT_SELECT,
            }),
            transaction.user.findFirst({
              where: {
                id: user.userId,
                tenantId: user.tenantId,
                role: Role.ADMIN,
                isActive: true,
              },
              select: { id: true },
            }),
            transaction.user.findFirst({
              where: {
                id: dto.responsibleDataUserId,
                tenantId: user.tenantId,
                isActive: true,
                role: { in: [...DATA_RESPONSIBLE_ROLES] },
              },
              select: { id: true, role: true },
            }),
            transaction.operationProfile.findUnique({
              where: { tenantId: user.tenantId },
              select: PROFILE_SELECT,
            }),
            transaction.campaignSettings.findUnique({
              where: { tenantId: user.tenantId },
              select: SETTINGS_SELECT,
            }),
          ]);

        if (!tenant) {
          throw new NotFoundException('Organizacion no encontrada');
        }
        assertCampaignTenant(tenant);
        if (!actor) {
          throw new ForbiddenException(
            'Solo la administracion vigente puede configurar la operacion politica',
          );
        }
        if (!responsible) {
          throw new BadRequestException(
            'El responsable de datos debe ser un usuario activo de esta organizacion con rol de administracion, direccion o cumplimiento',
          );
        }

        if (
          currentProfile &&
          currentSettings &&
          this.matchesDto(currentProfile, currentSettings, dto)
        ) {
          return this.toContext(currentProfile, currentSettings);
        }

        this.assertExpectedVersion(currentProfile, dto.expectedUpdatedAt);

        const budget = {
          maxTotalBudget: new Prisma.Decimal(String(dto.maxTotalBudget)),
          maxPublicityLimit: new Prisma.Decimal(String(dto.maxPublicityLimit)),
        };
        const settings = await transaction.campaignSettings.upsert({
          where: { tenantId: user.tenantId },
          create: { tenantId: user.tenantId, ...budget },
          update: budget,
          select: SETTINGS_SELECT,
        });

        const profileData = {
          operationType: dto.operationType,
          stage: dto.stage,
          electionType: dto.electionType,
          circumscriptionType: dto.circumscriptionType,
          circumscriptionName: dto.circumscriptionName,
          circumscriptionCode: dto.circumscriptionCode ?? null,
          listType: dto.listType ?? null,
          electionDate: new Date(dto.electionDate),
          expectedTeamSize: dto.expectedTeamSize,
          candidateCount: dto.candidateCount,
          dataControllerName: dto.dataControllerName,
          responsibleDataUserId: responsible.id,
          retentionPeriodDays: dto.retentionPeriodDays,
          revocationProcedure: dto.revocationProcedure,
          updatedById: actor.id,
        };

        const profile = currentProfile
          ? await transaction.operationProfile.update({
              where: { tenantId: user.tenantId },
              data: profileData,
              select: PROFILE_SELECT,
            })
          : await transaction.operationProfile.create({
              data: {
                tenantId: user.tenantId,
                ...profileData,
                createdById: actor.id,
              },
              select: PROFILE_SELECT,
            });

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: currentProfile
              ? 'OPERATION_PROFILE_UPDATED'
              : 'OPERATION_PROFILE_CREATED',
            resourceType: 'OperationProfile',
            resourceId: profile.id,
            before:
              currentProfile && currentSettings
                ? this.toAuditSnapshot(currentProfile, currentSettings)
                : undefined,
            after: this.toAuditSnapshot(profile, settings),
          },
        });

        return this.toContext(profile, settings);
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Otra configuracion fue creada al mismo tiempo; recarga antes de continuar',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La configuracion cambio durante la solicitud; recarga e intenta nuevamente',
        );
      }
      throw error;
    }
  }

  private assertExpectedVersion(
    current: SelectedProfile | null,
    expectedUpdatedAt: string | undefined,
  ): void {
    if (!current && expectedUpdatedAt) {
      throw new ConflictException(
        'La configuracion esperada ya no existe; recarga antes de continuar',
      );
    }
    if (!current) return;
    if (!expectedUpdatedAt) {
      throw new ConflictException(
        'Debes enviar la version que abriste para no sobrescribir cambios de otro usuario',
      );
    }
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException(
        'La configuracion fue modificada por otra persona; recarga antes de guardar',
      );
    }
  }

  private matchesDto(
    profile: SelectedProfile,
    settings: SelectedSettings,
    dto: UpsertOperationProfileDto,
  ): boolean {
    return (
      profile.operationType === dto.operationType &&
      profile.stage === dto.stage &&
      profile.electionType === dto.electionType &&
      profile.circumscriptionType === dto.circumscriptionType &&
      profile.circumscriptionName === dto.circumscriptionName &&
      profile.circumscriptionCode === (dto.circumscriptionCode ?? null) &&
      profile.listType === (dto.listType ?? null) &&
      profile.electionDate.getTime() === new Date(dto.electionDate).getTime() &&
      profile.expectedTeamSize === dto.expectedTeamSize &&
      profile.candidateCount === dto.candidateCount &&
      profile.dataControllerName === dto.dataControllerName &&
      profile.responsibleDataUserId === dto.responsibleDataUserId &&
      profile.retentionPeriodDays === dto.retentionPeriodDays &&
      profile.revocationProcedure === dto.revocationProcedure &&
      settings.maxTotalBudget.equals(dto.maxTotalBudget) &&
      settings.maxPublicityLimit.equals(dto.maxPublicityLimit)
    );
  }

  private toContext(profile: SelectedProfile, settings: SelectedSettings) {
    return {
      configured: true,
      profile: {
        ...profile,
        budget: {
          maxTotalBudget: settings.maxTotalBudget.toNumber(),
          maxPublicityLimit: settings.maxPublicityLimit.toNumber(),
        },
        derived: this.deriveConfiguration(profile),
      },
    };
  }

  private deriveConfiguration(profile: SelectedProfile) {
    const dayDStages: readonly PoliticalOperationStage[] = [
      PoliticalOperationStage.ELECTION_PREPARATION,
      PoliticalOperationStage.SIMULATION,
      PoliticalOperationStage.ELECTION_DAY,
      PoliticalOperationStage.POST_ELECTION,
    ];
    const warRoomStages: readonly PoliticalOperationStage[] = [
      PoliticalOperationStage.SIMULATION,
      PoliticalOperationStage.ELECTION_DAY,
    ];

    return {
      workspace:
        profile.stage === PoliticalOperationStage.ELECTION_DAY
          ? 'ELECTION_DAY'
          : profile.stage === PoliticalOperationStage.SIMULATION
            ? 'SIMULATION'
            : 'DAILY_OPERATION',
      scale:
        profile.expectedTeamSize <= 10
          ? 'SMALL'
          : profile.expectedTeamSize <= 100
            ? 'MEDIUM'
            : 'LARGE',
      dayDEnabled: dayDStages.includes(profile.stage),
      warRoomEnabled: warRoomStages.includes(profile.stage),
      signatureCollectionEnabled:
        profile.operationType === PoliticalOperationType.SIGNATURE_COMMITTEE ||
        profile.stage === PoliticalOperationStage.SIGNATURE_COLLECTION,
      candidateListEnabled:
        profile.operationType ===
          PoliticalOperationType.CORPORATION_CANDIDACY ||
        profile.operationType === PoliticalOperationType.PARTY_MOVEMENT,
      preferentialVoteEnabled:
        profile.listType === CandidateListType.OPEN_PREFERENTIAL,
      territoryScope: this.toTerritoryScope(profile.circumscriptionType),
    };
  }

  private toTerritoryScope(type: ElectoralCircumscriptionType): string {
    const scopes: Record<ElectoralCircumscriptionType, string> = {
      [ElectoralCircumscriptionType.NATIONAL]: 'NATIONAL',
      [ElectoralCircumscriptionType.DEPARTMENTAL]: 'DEPARTMENT',
      [ElectoralCircumscriptionType.MUNICIPAL]: 'MUNICIPALITY',
      [ElectoralCircumscriptionType.LOCAL]: 'LOCALITY',
      [ElectoralCircumscriptionType.SPECIAL]: 'SPECIAL',
      [ElectoralCircumscriptionType.INTERNAL]: 'INTERNAL',
    };
    return scopes[type];
  }

  private toAuditSnapshot(
    profile: SelectedProfile,
    settings: SelectedSettings,
  ): Prisma.InputJsonObject {
    return {
      operationType: profile.operationType,
      stage: profile.stage,
      electionType: profile.electionType,
      circumscriptionType: profile.circumscriptionType,
      circumscriptionName: profile.circumscriptionName,
      circumscriptionCode: profile.circumscriptionCode,
      listType: profile.listType,
      electionDate: profile.electionDate.toISOString(),
      expectedTeamSize: profile.expectedTeamSize,
      candidateCount: profile.candidateCount,
      maxTotalBudget: settings.maxTotalBudget.toString(),
      maxPublicityLimit: settings.maxPublicityLimit.toString(),
      dataControllerName: profile.dataControllerName,
      responsibleDataUserId: profile.responsibleDataUserId,
      retentionPeriodDays: profile.retentionPeriodDays,
      revocationProcedureSha256: createHash('sha256')
        .update(profile.revocationProcedure, 'utf8')
        .digest('hex'),
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
