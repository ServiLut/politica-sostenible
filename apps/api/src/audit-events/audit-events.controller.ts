import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditEventsService } from './audit-events.service';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';

const AUDIT_READ_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Audit events')
@ApiBearerAuth()
@Roles(...AUDIT_READ_ROLES)
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly auditEventsService: AuditEventsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista la bitácora minimizada del tenant y modo activos',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAuditEventsQueryDto,
  ) {
    return this.auditEventsService.findAll(user, query);
  }
}
