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
import { CommunicationsService } from './communications.service';
import { CreateCommunicationApprovalDto } from './dto/create-communication-approval.dto';
import { DecideCommunicationApprovalDto } from './dto/decide-communication-approval.dto';
import { ListCommunicationApprovalsQueryDto } from './dto/list-communication-approvals-query.dto';

const COMMUNICATION_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const COMMUNICATION_REQUEST_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
] as const;

const COMMUNICATION_DECISION_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.COMPLIANCE_OFFICER,
] as const;

@ApiTags('Communication approvals')
@ApiBearerAuth()
@Controller('communications/approvals')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get()
  @Roles(...COMMUNICATION_READ_ROLES)
  @ApiOperation({
    summary: 'Lista solicitudes de comunicación del tenant y modo activos',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCommunicationApprovalsQueryDto,
  ) {
    return this.communicationsService.findAll(user, query);
  }

  @Post()
  @Roles(...COMMUNICATION_REQUEST_ROLES)
  @ApiOperation({
    summary: 'Solicita revisión de una comunicación sin enviarla ni publicarla',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommunicationApprovalDto,
  ) {
    return this.communicationsService.create(user, dto);
  }

  @Patch(':id/decision')
  @Roles(...COMMUNICATION_DECISION_ROLES)
  @ApiOperation({
    summary: 'Aprueba o rechaza mediante revisión independiente de cuatro ojos',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideCommunicationApprovalDto,
  ) {
    return this.communicationsService.decide(user, id, dto);
  }
}
