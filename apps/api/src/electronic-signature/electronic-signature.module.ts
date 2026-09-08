import { Module } from '@nestjs/common';
import { ElectronicSignatureService } from './electronic-signature.service';
import { ElectronicSignatureController } from './electronic-signature.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, StorageModule, AuthModule],
  providers: [ElectronicSignatureService],
  controllers: [ElectronicSignatureController],
  exports: [ElectronicSignatureService],
})
export class ElectronicSignatureModule {}
