import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CatalogReleaseDetailQueryDto,
  CatalogReleaseDiffQueryDto,
  CatalogReleaseIdParamsDto,
  CatalogReleaseIntegrityDto,
  ListCatalogReleasesQueryDto,
} from './dto/catalog-release.dto';
import { ElectoralCatalogService } from './electoral-catalog.service';

@ApiTags('Electoral catalog releases')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
@BlockWhenOperationClosed()
@Controller('electoral-catalog/releases')
export class ElectoralCatalogController {
  constructor(private readonly catalogs: ElectoralCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Lista releases del tenant autenticado' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCatalogReleasesQueryDto,
  ) {
    return this.catalogs.listReleases(user, query);
  }

  @Get(':id/diff')
  @ApiOperation({ summary: 'Compara dos snapshots inmutables del catalogo' })
  diff(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CatalogReleaseIdParamsDto,
    @Query() query: CatalogReleaseDiffQueryDto,
  ) {
    return this.catalogs.diffRelease(user, params.id, query);
  }

  @Get(':id/gaps')
  @ApiOperation({ summary: 'Consulta vacios estructurales y de cobertura' })
  gaps(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CatalogReleaseIdParamsDto,
  ) {
    return this.catalogs.getReleaseGaps(user, params.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un release y una pagina de sus entradas' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CatalogReleaseIdParamsDto,
    @Query() query: CatalogReleaseDetailQueryDto,
  ) {
    return this.catalogs.getRelease(user, params.id, query);
  }

  @Post(':id/validate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Valida la estructura de un release STAGED' })
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CatalogReleaseIdParamsDto,
    @Body() dto: CatalogReleaseIntegrityDto,
  ) {
    return this.catalogs.validateRelease(user, params.id, dto);
  }

  @Post(':id/activate')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Activa un release validado con aprobacion independiente y auditoria',
  })
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CatalogReleaseIdParamsDto,
    @Body() dto: CatalogReleaseIntegrityDto,
  ) {
    return this.catalogs.activateRelease(user, params.id, dto);
  }
}
