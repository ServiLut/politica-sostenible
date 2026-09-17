import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Legacy compatibility shell.
 *
 * The previous implementation performed unreviewed deleteMany operations.
 * It remains outside AppModule and now fails closed if an old caller tries to
 * invoke it. All supported retention work lives in RetentionGovernanceModule
 * and is deliberately non-destructive.
 */
@Injectable()
export class RetentionService {
  handleDataRetention(tenantId: string): never {
    void tenantId;
    throw new ServiceUnavailableException({
      code: 'AUTOMATED_RETENTION_DISABLED',
      message:
        'La purga automatica esta deshabilitada; use el gobierno de retencion no destructivo',
    });
  }
}
