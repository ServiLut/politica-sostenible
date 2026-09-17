import { Body, Controller, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SyncE14Dto } from './dto/sync-e14.dto';
import { SyncVoterDto } from './dto/sync-voter.dto';
import { LogisticsService } from './logistics.service';
import { PoliticalOperationStage, Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  BlockWhenOperationClosed,
  RequireOperationStages,
} from '../auth/decorators/operation-stage-policy.decorator';

const E14_SYNC_STAGES = [
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
];

const E14_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const VOTER_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
];

@ApiTags('Logistics')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Post('sync/e14')
  @RequireOperationStages(...E14_SYNC_STAGES)
  @Roles(...E14_WRITE_ROLES)
  async syncE14(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: SyncE14Dto,
  ) {
    return this.logisticsService.syncE14(user.tenantId, user.userId, data);
  }

  @Post('sync/voter')
  @Roles(...VOTER_WRITE_ROLES)
  async syncVoter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: SyncVoterDto,
    @Ip() syncRequestIp: string,
  ) {
    return this.logisticsService.syncVoter(user, syncRequestIp, data);
  }
}
