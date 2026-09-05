import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class SaasAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const adminEmails = (process.env.SAAS_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase());
    return adminEmails.includes(user?.email?.toLowerCase());
  }
}
