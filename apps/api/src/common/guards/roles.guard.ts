import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/prisma';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtIdentityService } from '../services/jwt-identity.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const identity = await this.jwtIdentityService.fromAuthorizationHeader(
      request.headers?.authorization,
    );

    if (!identity.role || !requiredRoles.includes(identity.role as Role)) {
      throw new ForbiddenException(
        'No tienes permisos para ejecutar esta acción',
      );
    }

    request.identity = identity;
    return true;
  }
}
