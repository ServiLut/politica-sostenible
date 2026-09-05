import { Module } from '@nestjs/common';
import { SaasAdminController } from './saas-admin.controller';
import { SaasAdminService } from './saas-admin.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SaasAdminController],
  providers: [SaasAdminService],
})
export class SaasAdminModule {}
