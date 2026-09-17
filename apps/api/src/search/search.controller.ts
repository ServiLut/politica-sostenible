import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GlobalSearchDto } from './dto/global-search.dto';

import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @Roles(...Object.values(Role))
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Busca recursos visibles dentro del tenant activo' })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GlobalSearchDto,
  ) {
    return this.searchService.globalSearch(user, dto.query);
  }
}
