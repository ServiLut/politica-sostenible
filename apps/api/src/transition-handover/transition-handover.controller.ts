import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ListTransitionHandoverReportsQueryDto } from './dto/list-transition-handover-reports-query.dto';
import { TransitionHandoverService } from './transition-handover.service';

@ApiTags('Post-election closeout')
@ApiBearerAuth()
@Controller('transition-handover')
export class TransitionHandoverController {
  constructor(
    private readonly transitionHandoverService: TransitionHandoverService,
  ) {}

  @Post('report')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @ApiOperation({
    summary:
      'Genera un expediente interno, minimizado y auditable de cierre poselectoral',
  })
  getHandoverReport(@CurrentUser() user: AuthenticatedUser) {
    return this.transitionHandoverService.generateHandoverReport(user);
  }

  @Get('reports')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Lista expedientes internos conservados sin devolver su payload',
  })
  listHandoverReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransitionHandoverReportsQueryDto,
  ) {
    return this.transitionHandoverService.listHandoverReports(
      user,
      query.page,
      query.limit,
    );
  }

  @Get('reports/:reportId')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiOperation({
    summary: 'Recupera por ID el payload exacto de un expediente inmutable',
  })
  getStoredHandoverReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', new ParseUUIDPipe({ version: '4' })) reportId: string,
  ) {
    return this.transitionHandoverService.getHandoverReport(user, reportId);
  }
}
