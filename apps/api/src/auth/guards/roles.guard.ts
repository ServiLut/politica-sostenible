import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/prisma';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_ANY_AUTHENTICATED_KEY } from '../decorators/allow-any-authenticated.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const role = request.user?.role;

      if (!role || !requiredRoles.includes(role as Role)) {
        throw new ForbiddenException(
          'Tu rol no tiene permisos para realizar esta acción',
        );
      }

      return true;
    }

    // No @Roles() decorator — check if the route is explicitly public or
    // allows any authenticated user.  Otherwise deny by default (fail-closed).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowAnyAuthenticated = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANY_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowAnyAuthenticated) {
      return true;
    }

    // Fail-closed: no decorator means access denied
    throw new ForbiddenException(
      'Endpoint sin configuración de roles — acceso denegado por defecto',
    );
  }
}
