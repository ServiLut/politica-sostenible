import {
  Body,
  Controller,
  Delete,
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
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CuidIdParamsDto } from '../common/dto/cuid-id-params.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
import { ListResponsiblesQueryDto } from './dto/list-responsibles-query.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalsService } from './proposals.service';

const PROPOSAL_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.AUDITOR,
  Role.COMPLIANCE_OFFICER,
];

const PROPOSAL_MANAGER_ROLES = [Role.ADMIN, Role.CAMPAIGN_MANAGER];

@ApiTags('Proposals')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Get('responsibles')
  @Roles(...PROPOSAL_MANAGER_ROLES)
  @ApiOperation({ summary: 'Lista responsables elegibles del tenant activo' })
  listResponsibles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListResponsiblesQueryDto,
  ) {
    return this.proposalsService.listResponsibles(user, query);
  }

  @Get()
  @Roles(...PROPOSAL_READ_ROLES)
  @ApiOperation({ summary: 'Lista propuestas políticas del tenant activo' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProposalsQueryDto,
  ) {
    return this.proposalsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(...PROPOSAL_READ_ROLES)
  @ApiOperation({ summary: 'Obtiene una propuesta política por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CuidIdParamsDto,
  ) {
    return this.proposalsService.findOne(user, params.id);
  }

  @Post()
  @Roles(...PROPOSAL_MANAGER_ROLES)
  @ApiOperation({ summary: 'Crea una propuesta política' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposalsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(...PROPOSAL_MANAGER_ROLES)
  @ApiOperation({ summary: 'Actualiza una propuesta política' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CuidIdParamsDto,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposalsService.update(user, params.id, dto);
  }

  @Delete(':id')
  @Roles(...PROPOSAL_MANAGER_ROLES)
  @ApiOperation({ summary: 'Elimina una propuesta política' })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CuidIdParamsDto,
  ) {
    return this.proposalsService.delete(user, params.id);
  }
}
