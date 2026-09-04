import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConsentNoticesService } from './consent-notices.service';
import { ActivateConsentNoticeDto } from './dto/activate-consent-notice.dto';

const CONSENT_NOTICE_READ_ROLES = Object.values(Role);

@ApiTags('Consent notices')
@ApiBearerAuth()
@Controller('consent-notices')
export class ConsentNoticesController {
  constructor(private readonly consentNotices: ConsentNoticesService) {}

  @Get('current')
  @Roles(...CONSENT_NOTICE_READ_ROLES)
  @ApiOperation({ summary: 'Consulta el aviso vigente del tenant autenticado' })
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.consentNotices.getCurrent(user);
  }

  @Put('current')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Activa una nueva version inmutable del aviso del tenant',
  })
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ActivateConsentNoticeDto,
  ) {
    return this.consentNotices.activate(user, dto);
  }
}
