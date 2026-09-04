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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000, blockDuration: 120_000 } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 4, ttl: 3_600_000, blockDuration: 3_600_000 } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('me')
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
}
