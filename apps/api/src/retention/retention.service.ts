import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditActorType,
  AuditOutcome,
  ConsentStatus,
} from '../../prisma/generated/prisma';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleDataRetention(tenantId: string): Promise<void> {
    this.logger.log(`Starting data retention for tenant ${tenantId}`);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        defaultMode: true,
        operationProfile: {
          select: {
            electionDate: true,
            retentionPeriodDays: true,
          },
        },
      },
    });

    const profile = tenant?.operationProfile;
    if (!tenant || !profile) {
      this.logger.warn(
        `Tenant ${tenantId}: No operation profile found. Skipping retention.`,
      );
      return;
    }

    const expirationDate = new Date(profile.electionDate);
    expirationDate.setUTCDate(
      expirationDate.getUTCDate() + profile.retentionPeriodDays,
    );

    if (new Date() < expirationDate) {
      this.logger.log(`Tenant ${tenantId}: Retention period has not expired.`);
      return;
    }

    this.logger.log(
      `Retention period expired for tenant ${tenantId}. Deleting data.`,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.consentRecord.updateMany({
          where: { tenantId },
          data: { status: ConsentStatus.EXPIRED },
        });

        const interactionsDeleted = await tx.interaction.deleteMany({
          where: { tenantId },
        });

        const consentRecordsDeleted = await tx.consentRecord.deleteMany({
          where: { tenantId },
        });

        const votersDeleted = await tx.voter.deleteMany({
          where: { tenantId },
        });

        await tx.auditEvent.create({
          data: {
            tenantId,
            mode: tenant.defaultMode,
            actorType: AuditActorType.SYSTEM,
            action: 'DATA_RETENTION_EXECUTED',
            resourceType: 'Tenant',
            resourceId: tenantId,
            outcome: AuditOutcome.SUCCESS,
            metadata: {
              deletedInteractions: interactionsDeleted.count,
              deletedConsentRecords: consentRecordsDeleted.count,
              deletedVoters: votersDeleted.count,
            },
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Error processing retention for tenant ${tenantId}`,
        error,
      );
    }
  }
}
