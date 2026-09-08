import { Module } from '@nestjs/common';
import { SaasAdminController } from './saas-admin.controller';
import { SaasAdminService } from './saas-admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import {
  loadSaasAdminIdentityConfig,
  SAAS_ADMIN_IDENTITY_CONFIG,
  SaasAdminGuard,
} from '../auth/guards/saas-admin.guard';

@Module({
  imports: [PrismaModule],
  controllers: [SaasAdminController],
  providers: [
    SaasAdminService,
    {
      provide: SAAS_ADMIN_IDENTITY_CONFIG,
      useFactory: () => loadSaasAdminIdentityConfig(process.env),
    },
    SaasAdminGuard,
  ],
  exports: [SAAS_ADMIN_IDENTITY_CONFIG],
})
export class SaasAdminModule {}
