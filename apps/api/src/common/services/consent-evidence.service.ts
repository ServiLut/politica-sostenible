import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConsentEvidenceService {
  private readonly logger = new Logger(ConsentEvidenceService.name);
  private readonly salt: string;

  constructor(configService: ConfigService) {
    const configuredSalt = configService.get<string>('CONSENT_IP_SALT')?.trim();
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    if (isProduction && !configuredSalt) {
      throw new Error('CONSENT_IP_SALT es obligatorio en producción');
    }

    if (!configuredSalt) {
      this.logger.warn(
        'CONSENT_IP_SALT no está configurado; usando salt exclusivo de desarrollo',
      );
    }

    this.salt = configuredSalt ?? 'development-only-consent-ip-salt-change-me';
  }

  hashIp(ipAddress: string): string {
    const normalizedIp = ipAddress.trim().toLowerCase();
    return createHash('sha256')
      .update(this.salt)
      .update('\0')
      .update(normalizedIp)
      .digest('hex');
  }
}
