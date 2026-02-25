import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { VotingPlacesService } from './voting-places.service';
import { VotingPlacesController } from './voting-places.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    HttpModule,
    CacheModule.register({ ttl: 3600000 }), // 1 hour
    PrismaModule,
  ],
  controllers: [VotingPlacesController],
  providers: [VotingPlacesService],
})
export class VotingPlacesModule {}
