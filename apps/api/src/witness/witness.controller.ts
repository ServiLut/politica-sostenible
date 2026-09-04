import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { WitnessService } from './witness.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWitnessReportDto } from './dto/create-witness-report.dto';
import { ListWitnessReportsQueryDto } from './dto/list-witness-reports-query.dto';
import { ReviewWitnessReportDto } from './dto/review-witness-report.dto';
import { UpdatePollingPlaceProfileDto } from './dto/update-polling-place-profile.dto';
import {
  PollingPlaceParamsDto,
  WitnessReportParamsDto,
} from './dto/witness-params.dto';
import { Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';

const WITNESS_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const WITNESS_READ_ROLES = [
  ...WITNESS_WRITE_ROLES,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const WITNESS_REVIEW_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
];
const WITNESS_PROFILE_ROLES = [Role.ADMIN, Role.CAMPAIGN_MANAGER];

@ApiTags('Witnesses')
@ApiBearerAuth()
@Controller('witnesses')
export class WitnessController {
  constructor(private readonly witnessService: WitnessService) {}

  @Post()
  @Roles(...WITNESS_WRITE_ROLES)
  @ApiOperation({ summary: 'Radicar un reporte E-14 para conciliacion' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWitnessReportDto,
  ) {
    return this.witnessService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  @Roles(...WITNESS_READ_ROLES)
  @ApiOperation({ summary: 'Listar y resumir la conciliacion E-14' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWitnessReportsQueryDto,
  ) {
    return this.witnessService.findAll(user.tenantId, user.userId, query);
  }

  @Patch(':id/review')
  @Roles(...WITNESS_REVIEW_ROLES)
  @ApiOperation({ summary: 'Aceptar o rechazar un reporte E-14 pendiente' })
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessReportParamsDto,
    @Body() dto: ReviewWitnessReportDto,
  ) {
    return this.witnessService.review(
      user.tenantId,
      user.userId,
      params.id,
      dto,
    );
  }

  @Put('places/:puestoId/profile')
  @Roles(...WITNESS_PROFILE_ROLES)
  @ApiOperation({ summary: 'Configurar las mesas esperadas de un puesto' })
  async updatePollingPlaceProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PollingPlaceParamsDto,
    @Body() dto: UpdatePollingPlaceProfileDto,
  ) {
    return this.witnessService.updatePollingPlaceProfile(
      user.tenantId,
      user.userId,
      params.puestoId,
      dto,
    );
  }
}
