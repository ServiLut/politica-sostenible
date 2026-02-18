import { Controller, Post, Get, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { VoterService } from './voter.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';

@ApiTags('Voters')
@Controller('voters')
export class VoterController {
  constructor(private readonly voterService: VoterService) {}

  @Post()
  @ApiOperation({ summary: 'Registra un nuevo votante' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-user-id', required: true })
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateVoterDto,
  ) {
    if (!tenantId || !userId) throw new UnauthorizedException('Faltan credenciales de campaña');
    return this.voterService.create(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos los votantes de la campaña' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new UnauthorizedException('Faltan credenciales de campaña');
    return this.voterService.findAll(tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtiene estadísticas de la campaña' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async getStats(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new UnauthorizedException('Faltan credenciales de campaña');
    return this.voterService.getStats(tenantId);
  }
}
