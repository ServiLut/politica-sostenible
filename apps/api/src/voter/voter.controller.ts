import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Headers,
  Param,
} from '@nestjs/common';
import { VoterService } from './voter.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtIdentityService } from '../common/services/jwt-identity.service';
import { UpdateVoterDto } from './dto/update-voter.dto';
import { UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@ApiTags('Voters')
@Controller('voters')
@UseGuards(RolesGuard)
export class VoterController {
  constructor(
    private readonly voterService: VoterService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @ApiOperation({ summary: 'Registra un nuevo votante' })
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateVoterDto,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.voterService.create(identity.tenantId, identity.userId, dto);
  }

  @Get()
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  @ApiOperation({ summary: 'Lista todos los votantes de la campaña' })
  @ApiHeader({ name: 'authorization', required: true })
  async findAll(@Headers('authorization') authorization: string | undefined) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.voterService.findAll(identity.tenantId);
  }

  @Get('stats')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  @ApiOperation({ summary: 'Obtiene estadísticas de la campaña' })
  @ApiHeader({ name: 'authorization', required: true })
  async getStats(@Headers('authorization') authorization: string | undefined) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.voterService.getStats(identity.tenantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @ApiOperation({ summary: 'Actualiza un votante de la campaña' })
  @ApiHeader({ name: 'authorization', required: true })
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateVoterDto,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.voterService.update(identity.tenantId, id, dto);
  }
}
