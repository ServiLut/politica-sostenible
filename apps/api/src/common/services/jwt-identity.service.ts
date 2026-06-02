import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface JwtPayload {
  sub: string;
  tenantId: string;
  email?: string;
  role?: string;
}

@Injectable()
export class JwtIdentityService {
  constructor(private readonly jwtService: JwtService) {}

  async fromAuthorizationHeader(authorization?: string) {
    const token = this.extractBearerToken(authorization);
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (!payload?.sub || !payload?.tenantId) {
      throw new UnauthorizedException('Token sin identidad completa');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
  }

  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header requerido');
    }
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de Authorization inválido');
    }
    return token;
  }
}
