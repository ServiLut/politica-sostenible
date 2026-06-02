import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { JwtIdentityService } from '../common/services/jwt-identity.service';

@Controller('logistics')
@UseGuards(RolesGuard)
export class LogisticsController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Post('sync/e14')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  async syncE14(
    @Headers('authorization') authorization: string | undefined,
    @Body() data: any,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.logisticsService.syncE14(identity.tenantId, identity.userId, data);
  }

  @Post('sync/voter')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.VOLUNTEER,
  )
  async syncVoter(
    @Headers('authorization') authorization: string | undefined,
    @Body() data: any,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.logisticsService.syncVoter(
      identity.tenantId,
      identity.userId,
      data,
    );
  }
}
