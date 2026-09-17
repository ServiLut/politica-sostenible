import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SyncOfflineIncidentDto } from './dto/sync-offline-incident.dto';
import { OfflineIncidentService } from './offline-incident.service';

const OFFLINE_INCIDENT_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
  Role.WITNESS,
] as const;

@ApiTags('Offline campaign incidents')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Roles(...OFFLINE_INCIDENT_ROLES)
@Controller('offline-incidents')
export class OfflineIncidentController {
  constructor(private readonly incidents: OfflineIncidentService) {}

  @Get('context')
  @ApiOperation({
    summary: 'Provisiona el alcance territorial permitido para captura cifrada',
  })
  getContext(@CurrentUser() user: AuthenticatedUser) {
    return this.incidents.getCaptureContext(user);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Sincroniza de forma idempotente un incidente cifrado en origen',
  })
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncOfflineIncidentDto,
  ) {
    return this.incidents.sync(user, dto);
  }
}
