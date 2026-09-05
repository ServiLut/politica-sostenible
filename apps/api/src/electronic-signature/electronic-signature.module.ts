import { Module } from '@nestjs/common';
import { ElectronicSignatureService } from './electronic-signature.service';
import { ElectronicSignatureController } from './electronic-signature.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ElectronicSignatureService],
  controllers: [ElectronicSignatureController],
  exports: [ElectronicSignatureService],
})
export class ElectronicSignatureModule {}
