import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { WitnessService } from './witness.service';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';

@ApiTags('Witnesses')
@Controller('witnesses')
export class WitnessController {
  constructor(private readonly witnessService: WitnessService) {}

  @Post()
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-user-id', required: true })
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: any,
  ) {
    if (!tenantId || !userId) throw new UnauthorizedException();
    return this.witnessService.create(tenantId, userId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.witnessService.findAll(tenantId);
  }
}
