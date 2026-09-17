import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AllowRequiredPasswordChange } from './decorators/allow-required-password-change.decorator';
import { Roles } from './decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

import { MfaService } from './mfa.service';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { MfaSetupDto } from './dto/mfa-setup.dto';
import {
  PlanFeature,
  RequiresPlanFeature,
} from './decorators/requires-plan-feature.decorator';
import { AllowSaasAdminMfaEnrollment } from './decorators/allow-saas-admin-mfa-enrollment.decorator';
import { AllowAnyAuthenticatedRole } from './decorators/allow-any-authenticated.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000, blockDuration: 120_000 } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('registration-policy')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000, blockDuration: 60_000 } })
  registrationPolicy() {
    return this.authService.registrationPolicy();
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 4, ttl: 3_600_000, blockDuration: 3_600_000 } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('me')
  @AllowAnyAuthenticatedRole()
  @AllowRequiredPasswordChange()
  currentSession(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.currentSession(user);
  }

  @Patch('organization')
  @Roles(Role.ADMIN)
  updateOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.authService.updateOrganization(user, dto);
  }

  @Post('change-password')
  @AllowAnyAuthenticatedRole()
  @AllowRequiredPasswordChange()
  @Throttle({
    default: { limit: 5, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @Post('logout')
  @AllowAnyAuthenticatedRole()
  @AllowRequiredPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @Post('mfa/setup')
  @AllowAnyAuthenticatedRole()
  @RequiresPlanFeature(PlanFeature.MFA)
  @AllowSaasAdminMfaEnrollment()
  @Throttle({
    default: { limit: 3, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  async setupMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MfaSetupDto,
  ) {
    return this.mfaService.generateSecret(
      user.userId,
      user.tenantId,
      body.currentPassword,
    );
  }

  @Post('mfa/verify')
  @AllowAnyAuthenticatedRole()
  @RequiresPlanFeature(PlanFeature.MFA)
  @AllowSaasAdminMfaEnrollment()
  @Throttle({
    default: { limit: 5, ttl: 5 * 60_000, blockDuration: 15 * 60_000 },
  })
  async verifyMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MfaVerifyDto,
  ) {
    return this.mfaService.verifyAndEnable(
      user.userId,
      user.tenantId,
      body.code,
    );
  }

  @Post('mfa/disable')
  @AllowAnyAuthenticatedRole()
  @Throttle({
    default: { limit: 5, ttl: 5 * 60_000, blockDuration: 15 * 60_000 },
  })
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MfaVerifyDto,
  ) {
    return this.mfaService.disable(user.userId, user.tenantId, body.code);
  }

  @Get('mfa/status')
  @AllowAnyAuthenticatedRole()
  async mfaStatus(@CurrentUser() user: AuthenticatedUser) {
    const enabled = await this.mfaService.hasMfaEnabled(
      user.userId,
      user.tenantId,
    );
    return { enabled };
  }
}
