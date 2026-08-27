import { Controller, Post, Get, Body } from '@nestjs/common';
import { WitnessService } from './witness.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWitnessReportDto } from './dto/create-witness-report.dto';
import { Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';

const WITNESS_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const WITNESS_READ_ROLES = [...WITNESS_WRITE_ROLES, Role.AUDITOR];

@ApiTags('Witnesses')
@ApiBearerAuth()
@Controller('witnesses')
export class WitnessController {
  constructor(private readonly witnessService: WitnessService) {}

  @Post()
  @Roles(...WITNESS_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWitnessReportDto,
  ) {
    return this.witnessService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  @Roles(...WITNESS_READ_ROLES)
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.witnessService.findAll(user.tenantId);
  }
}
