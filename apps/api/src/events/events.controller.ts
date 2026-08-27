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
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateCampaignEventDto } from './dto/create-campaign-event.dto';
import { ListCampaignEventsQueryDto } from './dto/list-campaign-events-query.dto';
import { TransitionCampaignEventDto } from './dto/transition-campaign-event.dto';
import { UpdateCampaignEventDto } from './dto/update-campaign-event.dto';
import { EventsService } from './events.service';

const EVENT_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
  Role.VOLUNTEER,
] as const;

const EVENT_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.ZONE_COORDINATOR,
] as const;

@ApiTags('Operational events')
@ApiBearerAuth()
@Roles(...EVENT_READ_ROLES)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('responsibles')
  @Roles(...EVENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Lista responsables elegibles del tenant activo' })
  listResponsibles(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.listResponsibles(user);
  }

  @Get()
  @ApiOperation({ summary: 'Lista la agenda del tenant y modo activos' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCampaignEventsQueryDto,
  ) {
    return this.eventsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un evento del tenant y modo activos' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.findOne(user, id);
  }

  @Post()
  @Roles(...EVENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Crea un borrador de evento operativo' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCampaignEventDto,
  ) {
    return this.eventsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(...EVENT_WRITE_ROLES)
  @ApiOperation({
    summary: 'Actualiza la planeación de un evento no finalizado',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignEventDto,
  ) {
    return this.eventsService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(...EVENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Ejecuta una transición válida del evento' })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionCampaignEventDto,
  ) {
    return this.eventsService.transition(user, id, dto);
  }

  @Delete(':id')
  @Roles(...EVENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Elimina únicamente un borrador sin asistencias' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.remove(user, id);
  }
}
