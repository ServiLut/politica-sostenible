import { Body, Controller, Get, Headers, Put, UseGuards } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { UpdateOperationsStateDto } from './dto/update-operations-state.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@Controller('operations')
@UseGuards(RolesGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('state')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  async getState(@Headers('authorization') authorization?: string) {
    return this.operationsService.getState(authorization);
  }

  @Put('state')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  async updateState(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateOperationsStateDto,
  ) {
    return this.operationsService.updateState(authorization, dto);
  }

  @Get('intelligence')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  async getIntelligence(@Headers('authorization') authorization?: string) {
    return this.operationsService.getIntelligence(authorization);
  }
}
