import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import { ListTeamQueryDto } from './dto/list-team-query.dto';
import {
  TeamMemberParamsDto,
  UpdateTeamMemberDivisionDto,
  UpdateTeamMemberRoleDto,
  UpdateTeamMemberStatusDto,
} from './dto/team-member-lifecycle.dto';
import { TeamService } from './team.service';

@ApiTags('Team')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  @ApiOperation({ summary: 'Lista miembros seguros del tenant del JWT' })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTeamQueryDto,
  ) {
    return this.teamService.listMembers(user, query);
  }

  @Patch('members/:memberId/role')
  @ApiOperation({
    summary: 'Cambia el rol operativo de un miembro modificable',
  })
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TeamMemberParamsDto,
    @Body() dto: UpdateTeamMemberRoleDto,
  ) {
    return this.teamService.updateMemberRole(user, params.memberId, dto);
  }

  @Patch('members/:memberId/status')
  @ApiOperation({ summary: 'Activa o desactiva una cuenta modificable' })
  updateMemberStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TeamMemberParamsDto,
    @Body() dto: UpdateTeamMemberStatusDto,
  ) {
    return this.teamService.updateMemberStatus(user, params.memberId, dto);
  }

  @Patch('members/:memberId/division')
  @ApiOperation({
    summary: 'Asigna o retira el alcance territorial de un miembro',
  })
  updateMemberDivision(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TeamMemberParamsDto,
    @Body() dto: UpdateTeamMemberDivisionDto,
  ) {
    return this.teamService.updateMemberDivision(user, params.memberId, dto);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Lista invitaciones pendientes sin token ni hash' })
  listInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTeamQueryDto,
  ) {
    return this.teamService.listPendingInvitations(user, query);
  }

  @Post('invitations')
  @Throttle({
    default: { limit: 20, ttl: 3_600_000, blockDuration: 3_600_000 },
  })
  @ApiOperation({ summary: 'Crea una invitacion manual de un solo uso' })
  createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeamInvitationDto,
  ) {
    return this.teamService.createInvitation(user, dto);
  }
}
