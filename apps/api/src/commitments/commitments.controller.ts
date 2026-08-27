import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CommitmentsService } from './commitments.service';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { ListCommitmentsQueryDto } from './dto/list-commitments-query.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';

const COMMITMENT_READ_ROLES = Object.values(Role);
const COMMITMENT_MANAGER_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
];

@ApiTags('Commitments')
@ApiBearerAuth()
@Controller('commitments')
export class CommitmentsController {
  constructor(private readonly commitmentsService: CommitmentsService) {}

  @Get()
  @Roles(...COMMITMENT_READ_ROLES)
  @ApiOperation({
    summary: 'Lista compromisos del tenant y modo operativo activos',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCommitmentsQueryDto,
  ) {
    return this.commitmentsService.findAll(user, query);
  }

  @Post()
  @Roles(...COMMITMENT_MANAGER_ROLES)
  @ApiOperation({ summary: 'Crea un compromiso en el tenant y modo activos' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommitmentDto,
  ) {
    return this.commitmentsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(...COMMITMENT_MANAGER_ROLES)
  @ApiOperation({
    summary: 'Actualiza un compromiso del tenant y modo activos',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommitmentDto,
  ) {
    return this.commitmentsService.update(user, id, dto);
  }
}
