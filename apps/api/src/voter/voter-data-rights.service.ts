import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateVoterDataDto } from './dto/update-voter-data.dto';

export const VOTER_DATA_RIGHTS_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
] as const;

const VOTER_DATA_RIGHTS_SELECT = {
  id: true,
  documentId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  mesa: true,
  consentAccepted: true,
  consentTimestamp: true,
  termsVersion: true,
  createdAt: true,
  updatedAt: true,
  puesto: { select: { id: true, name: true } },
  registrar: { select: { name: true } },
} satisfies Prisma.VoterSelect;

const VOTER_EXPORT_SELECT = {
  id: true,
  documentId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  mesa: true,
  consentAccepted: true,
  consentTimestamp: true,
  termsVersion: true,
  createdAt: true,
  updatedAt: true,
  puesto: { select: { name: true } },
} satisfies Prisma.VoterSelect;

type VoterDataRightsView = Prisma.VoterGetPayload<{
  select: typeof VOTER_DATA_RIGHTS_SELECT;
}>;

type VoterExportSource = Prisma.VoterGetPayload<{
  select: typeof VOTER_EXPORT_SELECT;
}>;

type DataRightsTransaction = Prisma.TransactionClient;

const EXPORT_SCHEMA_VERSION = 'politica-sostenible.voter-export.v1';

@Injectable()
export class VoterDataRightsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(user: AuthenticatedUser, voterId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.assertAuthorizedActor(transaction, user);
      const voter = await this.findVoter(transaction, user.tenantId, voterId);

      await this.createAuditEvent(
        transaction,
        user,
        voter.id,
        'VOTER_PII_VIEWED',
        {
          operation: 'DETAIL',
        },
      );

      return voter;
    });
  }

  async exportPortable(user: AuthenticatedUser, voterId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.assertAuthorizedActor(transaction, user);
      const voter = await this.findVoterForExport(
        transaction,
        user.tenantId,
        voterId,
      );

      await this.createAuditEvent(
        transaction,
        user,
        voter.id,
        'VOTER_DATA_EXPORTED',
        {
          format: 'JSON',
          schemaVersion: EXPORT_SCHEMA_VERSION,
        },
      );

      return {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        voter: this.toPortableVoter(voter),
      };
    });
  }

  async update(
    user: AuthenticatedUser,
    voterId: string,
    dto: UpdateVoterDataDto,
  ) {
    const requestedData = this.toUpdateData(dto);
    if (Object.keys(requestedData).length === 0) {
      throw new BadRequestException(
        'La correccion debe incluir al menos un campo permitido',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await this.assertAuthorizedActor(transaction, user);
          const current = await this.findVoter(
            transaction,
            user.tenantId,
            voterId,
          );

          if (dto.puestoId) {
            const puesto = await transaction.politicalDivision.findFirst({
              where: {
                id: dto.puestoId,
                tenantId: user.tenantId,
                type: DivisionType.PUESTO,
              },
              select: { id: true },
            });

            if (!puesto) {
              throw new BadRequestException(
                'Puesto de votacion invalido para la campana autenticada',
              );
            }
          }

          const data = this.onlyChangedData(requestedData, current);
          const changedFields = Object.keys(data).sort();
          if (changedFields.length === 0) {
            throw new BadRequestException(
              'No hay cambios efectivos por guardar',
            );
          }

          const voter = await transaction.voter.update({
            where: { id: voterId, tenantId: user.tenantId },
            data,
            select: VOTER_DATA_RIGHTS_SELECT,
          });

          await this.createAuditEvent(
            transaction,
            user,
            voter.id,
            'VOTER_DATA_CORRECTED',
            { changedFields },
          );

          return voter;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Ya existe un ciudadano con ese documento en la organizacion',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'Los datos cambiaron durante la correccion; consulta la ficha e intenta de nuevo',
        );
      }
      if (this.isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Ciudadano no encontrado');
      }
      throw error;
    }
  }

  private async assertAuthorizedActor(
    transaction: DataRightsTransaction,
    user: AuthenticatedUser,
  ): Promise<void> {
    const tenant = await transaction.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);

    await resolveTerritorialAccess({
      client: transaction,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: VOTER_DATA_RIGHTS_ROLES,
      territoriallyScopedRoles: [],
    });
  }

  private async findVoter(
    transaction: DataRightsTransaction,
    tenantId: string,
    voterId: string,
  ): Promise<VoterDataRightsView> {
    const voter = await transaction.voter.findFirst({
      where: { id: voterId, tenantId },
      select: VOTER_DATA_RIGHTS_SELECT,
    });

    if (!voter) {
      throw new NotFoundException('Ciudadano no encontrado');
    }

    return voter;
  }

  private async findVoterForExport(
    transaction: DataRightsTransaction,
    tenantId: string,
    voterId: string,
  ): Promise<VoterExportSource> {
    const voter = await transaction.voter.findFirst({
      where: { id: voterId, tenantId },
      select: VOTER_EXPORT_SELECT,
    });

    if (!voter) {
      throw new NotFoundException('Ciudadano no encontrado');
    }

    return voter;
  }

  private toPortableVoter(voter: VoterExportSource) {
    return {
      id: voter.id,
      documentId: voter.documentId,
      firstName: voter.firstName,
      lastName: voter.lastName,
      phone: voter.phone,
      email: voter.email,
      mesa: voter.mesa,
      consentAccepted: voter.consentAccepted,
      consentTimestamp: voter.consentTimestamp,
      termsVersion: voter.termsVersion,
      createdAt: voter.createdAt,
      updatedAt: voter.updatedAt,
      puesto: voter.puesto ? { name: voter.puesto.name } : null,
    };
  }

  private toUpdateData(
    dto: UpdateVoterDataDto,
  ): Prisma.VoterUncheckedUpdateInput {
    const data: Prisma.VoterUncheckedUpdateInput = {};

    if (dto.documentId !== undefined) data.documentId = dto.documentId;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.mesa !== undefined) data.mesa = dto.mesa;
    if (dto.puestoId !== undefined) data.puestoId = dto.puestoId;

    return data;
  }

  private onlyChangedData(
    requested: Prisma.VoterUncheckedUpdateInput,
    current: VoterDataRightsView,
  ): Prisma.VoterUncheckedUpdateInput {
    const currentValues: Record<string, unknown> = {
      documentId: current.documentId,
      firstName: current.firstName,
      lastName: current.lastName,
      phone: current.phone,
      email: current.email,
      mesa: current.mesa,
      puestoId: current.puesto?.id ?? null,
    };

    return Object.fromEntries(
      Object.entries(requested).filter(
        ([field, value]) => currentValues[field] !== value,
      ),
    ) as Prisma.VoterUncheckedUpdateInput;
  }

  private async createAuditEvent(
    transaction: DataRightsTransaction,
    user: AuthenticatedUser,
    voterId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        tenantId: user.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: user.userId,
        action,
        resourceType: 'Voter',
        resourceId: voterId,
        metadata,
      },
    });
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
