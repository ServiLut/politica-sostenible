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
import { CasesService } from './cases.service';
import { CreateIssueCaseDto } from './dto/create-issue-case.dto';
import { ListIssueCasesQueryDto } from './dto/list-issue-cases-query.dto';
import { UpdateIssueCaseDto } from './dto/update-issue-case.dto';

@ApiTags('Citizen cases')
@ApiBearerAuth()
@Roles(
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.AUDITOR,
  Role.COMPLIANCE_OFFICER,
)
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get('assignees')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  )
  @ApiOperation({ summary: 'Lista responsables elegibles del tenant activo' })
  listAssignees(@CurrentUser() user: AuthenticatedUser) {
    return this.casesService.listAssignees(user);
  }

  @Get()
  @ApiOperation({ summary: 'Lista casos del tenant y modo operativo activos' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIssueCasesQueryDto,
  ) {
    return this.casesService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un caso del tenant y modo activos' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.casesService.findOne(user, id);
  }

  @Post()
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  )
  @ApiOperation({ summary: 'Radica una PQRS en el tenant y modo activos' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIssueCaseDto,
  ) {
    return this.casesService.create(user, dto);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  )
  @ApiOperation({ summary: 'Actualiza un caso sin eliminar su historial' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateIssueCaseDto,
  ) {
    return this.casesService.update(user, id, dto);
  }
}
