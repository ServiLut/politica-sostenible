import type { Request } from 'express';

export interface JwtTokenPayload {
  sub: string;
  tenantId: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
