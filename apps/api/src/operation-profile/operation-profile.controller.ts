import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpsertOperationProfileDto } from './dto/upsert-operation-profile.dto';
import { OperationProfileService } from './operation-profile.service';

const OPERATION_PROFILE_READ_ROLES = Object.values(Role);

@ApiTags('Political operation profile')
@ApiBearerAuth()
@Controller('operation-profile')
export class OperationProfileController {
  constructor(private readonly operationProfile: OperationProfileService) {}

  @Get()
  @Roles(...OPERATION_PROFILE_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta la configuracion de la organizacion autenticada',
  })
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.operationProfile.getCurrent(user);
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Crea o actualiza de forma auditada la configuracion politica del tenant',
  })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOperationProfileDto,
  ) {
    return this.operationProfile.upsert(user, dto);
  }
}
