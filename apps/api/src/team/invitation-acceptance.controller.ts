import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto';
import { TeamService } from './team.service';

@ApiTags('Authentication')
@Controller('auth/invitations')
export class InvitationAcceptanceController {
  constructor(private readonly teamService: TeamService) {}

  @Public()
  @Post('accept')
  @Throttle({
    default: { limit: 5, ttl: 900_000, blockDuration: 1_800_000 },
  })
  @ApiOperation({ summary: 'Acepta una invitacion valida de un solo uso' })
  accept(@Body() dto: AcceptTeamInvitationDto) {
    return this.teamService.acceptInvitation(dto);
  }
}
