import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { WitnessService } from './witness.service';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { JwtIdentityService } from '../common/services/jwt-identity.service';

@ApiTags('Witnesses')
@Controller('witnesses')
@UseGuards(RolesGuard)
export class WitnessController {
  constructor(
    private readonly witnessService: WitnessService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Post()
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.witnessService.create(identity.tenantId, identity.userId, dto);
  }

  @Get()
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  @ApiHeader({ name: 'authorization', required: true })
  async findAll(@Headers('authorization') authorization: string | undefined) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.witnessService.findAll(identity.tenantId);
  }
}
