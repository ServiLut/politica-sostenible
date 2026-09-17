import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateElectoralCatalogImportDto,
  ElectoralCatalogImportIdParamsDto,
  ListElectoralCatalogImportsQueryDto,
} from './dto/electoral-catalog-import.dto';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';

@ApiTags('Electoral catalog imports')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
@BlockWhenOperationClosed()
@Controller('electoral-catalog/imports')
export class ElectoralCatalogImportController {
  constructor(private readonly imports: ElectoralCatalogImportService) {}

  @Post()
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Encola un JSON RNEC ya subido y confirmado directamente en Storage',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateElectoralCatalogImportDto,
  ) {
    return this.imports.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista ingestas durables del tenant autenticado' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListElectoralCatalogImportsQueryDto,
  ) {
    return this.imports.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta el estado durable de una ingesta' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCatalogImportIdParamsDto,
  ) {
    return this.imports.detail(user, params.id);
  }

  @Post(':id/retry')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reencola de forma idempotente una ingesta fallida',
  })
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCatalogImportIdParamsDto,
  ) {
    return this.imports.retry(user, params.id);
  }
}
