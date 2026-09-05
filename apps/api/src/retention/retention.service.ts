import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

  @Cron('0 3 * * *')
  async handleDataRetention() {
    this.logger.log('Starting data retention job');

    const tenants = await this.prisma.tenant.findMany({
      include: {
        operationProfile: true,
      },
    });

    let processedCount = 0;
    const now = new Date();

    for (const tenant of tenants) {
      const profile = tenant.operationProfile;
      if (!profile || !profile.retentionPeriodDays) {
        continue;
      }

      const expirationDate = new Date(profile.createdAt);
      expirationDate.setDate(expirationDate.getDate() + profile.retentionPeriodDays);

      if (now >= expirationDate) {
        this.logger.log(`Retention period expired for tenant ${tenant.id}. Deleting data.`);
        
        try {
          await this.prisma.$transaction(async (tx) => {
            // Update consent records to EXPIRED before deletion
            await tx.consentRecord.updateMany({
              where: { tenantId: tenant.id },
              data: { status: ConsentStatus.EXPIRED },
            });

            const interactionsDeleted = await tx.interaction.deleteMany({
              where: { tenantId: tenant.id },
            });

            const consentRecordsDeleted = await tx.consentRecord.deleteMany({
              where: { tenantId: tenant.id },
            });

            const votersDeleted = await tx.voter.deleteMany({
              where: { tenantId: tenant.id },
            });

            await tx.auditEvent.create({
              data: {
                tenantId: tenant.id,
                mode: tenant.defaultMode,
                actorType: AuditActorType.SYSTEM,
                action: 'DATA_RETENTION_EXECUTED',
                resourceType: 'Tenant',
                resourceId: tenant.id,
                outcome: AuditOutcome.SUCCESS,
                metadata: {
                  deletedInteractions: interactionsDeleted.count,
                  deletedConsentRecords: consentRecordsDeleted.count,
                  deletedVoters: votersDeleted.count,
                },
              },
            });
          });
          processedCount++;
        } catch (error) {
          this.logger.error(`Error processing retention for tenant ${tenant.id}`, error);
        }
      }
    }

    this.logger.log(`Data retention job completed. Processed ${processedCount} tenants.`);
  }
}
