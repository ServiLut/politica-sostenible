import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { InvitationAcceptanceController } from './invitation-acceptance.controller';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TeamController, InvitationAcceptanceController],
  providers: [TeamService],
})
export class TeamModule {}
