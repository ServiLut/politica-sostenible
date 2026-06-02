import { Controller, Get, Query, UseGuards, Headers } from '@nestjs/common';
import { GisService } from './gis.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { JwtIdentityService } from '../common/services/jwt-identity.service';

@Controller('gis')
@UseGuards(RolesGuard)
export class GisController {
  constructor(
    private readonly gisService: GisService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Get('heatmaps/voters')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  async getVoterHeatmap(
    @Headers('authorization') authorization: string | undefined,
    @Query('divisionId') divisionId?: string
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.gisService.getVoterHeatmap(identity.tenantId, divisionId);
  }

  @Get('voting-places/spatial')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async getSpatialVotingPlaces(
    @Headers('authorization') authorization: string | undefined,
    @Query('municipio') municipio: string,
  ) {
    await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.gisService.getSpatialVotingPlaces(municipio);
  }
}
