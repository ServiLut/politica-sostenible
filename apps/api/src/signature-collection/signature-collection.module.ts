import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SignatureCollectionController } from './signature-collection.controller';
import { SignatureCollectionService } from './signature-collection.service';
import { SignatureCountCorrectionController } from './signature-count-correction.controller';
import { SignatureCountCorrectionService } from './signature-count-correction.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    SignatureCollectionController,
    SignatureCountCorrectionController,
  ],
  providers: [SignatureCollectionService, SignatureCountCorrectionService],
  exports: [SignatureCollectionService, SignatureCountCorrectionService],
})
export class SignatureCollectionModule {}
