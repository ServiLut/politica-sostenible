import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ConsentPurpose,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CONSENT_NOTICE_VIEW_SELECT,
  findActiveConsentNotice,
  getConsentPurposeForMode,
  type ConsentNoticeView,
} from '../common/utils/consent-notice.util';
import { PrismaService } from '../prisma/prisma.service';
import { ActivateConsentNoticeDto } from './dto/activate-consent-notice.dto';

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

@Injectable()
export class ConsentNoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(user: AuthenticatedUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { defaultMode: true },
    });
    if (!tenant) {
      throw new NotFoundException('Organizacion no encontrada');
    }

    const purpose = getConsentPurposeForMode(tenant.defaultMode);
    const notice = await findActiveConsentNotice(
      this.prisma,
      user.tenantId,
      tenant.defaultMode,
      purpose,
    );

    return this.toContext(tenant.defaultMode, purpose, notice);
  }

  async activate(user: AuthenticatedUser, dto: ActivateConsentNoticeDto) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [tenant, actor] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: user.tenantId },
            select: { defaultMode: true },
          }),
          transaction.user.findFirst({
            where: {
              id: user.userId,
              tenantId: user.tenantId,
              isActive: true,
            },
            select: { id: true, role: true },
          }),
        ]);
        if (!tenant) {
          throw new NotFoundException('Organizacion no encontrada');
        }
        if (!actor || actor.role !== Role.ADMIN) {
          throw new ForbiddenException(
            'Solo la administracion vigente puede activar el aviso de privacidad de la organizacion',
          );
        }

        const mode = tenant.defaultMode;
        const purpose = getConsentPurposeForMode(mode);
        const current = await findActiveConsentNotice(
          transaction,
          user.tenantId,
          mode,
          purpose,
        );

        if (current?.version === dto.version) {
          if (this.matchesDto(current, dto)) {
            return this.toContext(mode, purpose, current);
          }
          throw new ConflictException(
            'Esa version ya esta activa. Cambia el identificador de version para conservar el texto historico',
          );
        }

        const [reusedVersion, legacyConsent] = await Promise.all([
          transaction.consentNotice.findUnique({
            where: {
              tenantId_mode_purpose_version: {
                tenantId: user.tenantId,
                mode,
                purpose,
                version: dto.version,
              },
            },
            select: { id: true },
          }),
          transaction.consentRecord.findFirst({
            where: {
              tenantId: user.tenantId,
              mode,
              purpose,
              noticeVersion: dto.version,
            },
            select: { id: true },
          }),
        ]);
        if (reusedVersion || legacyConsent) {
          throw new ConflictException(
            'La version indicada ya pertenece al historial de avisos o autorizaciones y no puede sobrescribirse ni reutilizarse',
          );
        }

        const now = new Date();
        if (current) {
          await transaction.consentNotice.update({
            where: { id: current.id, tenantId: user.tenantId },
            data: { isActive: false, retiredAt: now },
          });
        }

        const notice = await transaction.consentNotice.create({
          data: {
            tenantId: user.tenantId,
            mode,
            purpose,
            version: dto.version,
            title: dto.title,
            content: dto.content,
            controllerName: dto.controllerName,
            contactEmail: dto.contactEmail,
            privacyPolicyUrl: dto.privacyPolicyUrl,
            createdById: actor.id,
            activatedAt: now,
          },
          select: CONSENT_NOTICE_VIEW_SELECT,
        });

        const invalidatedVoters =
          mode === PoliticalOperationMode.CAMPAIGN &&
          purpose === ConsentPurpose.POLITICAL_COMMUNICATION
            ? await transaction.voter.updateMany({
                where: { tenantId: user.tenantId, consentAccepted: true },
                data: { consentAccepted: false },
              })
            : { count: 0 };

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'CONSENT_NOTICE_ACTIVATED',
            resourceType: 'ConsentNotice',
            resourceId: notice.id,
            before: current ? { version: current.version } : undefined,
            after: { version: notice.version, mode, purpose },
            metadata: {
              invalidatedVoterCount: invalidatedVoters.count,
              configuredFields: [
                'contactEmail',
                'content',
                'controllerName',
                'privacyPolicyUrl',
                'title',
              ],
            },
          },
        });

        return this.toContext(mode, purpose, notice);
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Otra version del aviso fue activada al mismo tiempo; recarga la configuracion',
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

  private toContext(
    mode: PoliticalOperationMode,
    purpose: ConsentPurpose,
    notice: ConsentNoticeView | null,
  ) {
    return { configured: notice !== null, mode, purpose, notice };
  }

  private matchesDto(
    current: ConsentNoticeView,
    dto: ActivateConsentNoticeDto,
  ): boolean {
    return (
      current.title === dto.title &&
      current.content === dto.content &&
      current.controllerName === dto.controllerName &&
      current.contactEmail === dto.contactEmail &&
      current.privacyPolicyUrl === (dto.privacyPolicyUrl ?? null)
    );
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
