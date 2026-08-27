import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
  JwtTokenPayload,
} from '../interfaces/authenticated-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Se requiere un token Bearer válido');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtTokenPayload>(
        token,
        { algorithms: ['HS256'] },
      );
      const identity = this.toTokenIdentity(payload);
      const currentUser = await this.prisma.user.findFirst({
        where: {
          id: identity.userId,
          tenantId: identity.tenantId,
          isActive: true,
        },
        select: {
          email: true,
          role: true,
        },
      });

      if (!currentUser) {
        throw new UnauthorizedException('Token invalido o expirado');
      }

      // El rol del JWT puede estar obsoleto. Autorizamos exclusivamente con el
      // rol vigente de PostgreSQL para que una baja o cambio sea inmediato.
      request.user = Object.freeze({
        ...identity,
        email: currentUser.email,
        role: currentUser.role,
      });
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractBearerToken(authorization?: string): string | undefined {
    if (!authorization) {
      return undefined;
    }

    const parts = authorization.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return undefined;
    }

    return parts[1] || undefined;
  }

  private toTokenIdentity(
    payload: JwtTokenPayload,
  ): Pick<AuthenticatedUser, 'userId' | 'tenantId'> {
    if (!this.isSafeIdentifier(payload.sub)) {
      throw new UnauthorizedException('El token no identifica al usuario');
    }

    if (!this.isSafeIdentifier(payload.tenantId)) {
      throw new UnauthorizedException('El token no identifica a la campaña');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
    };
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isSafeIdentifier(value: unknown): value is string {
    return this.isNonEmptyString(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  }
}
