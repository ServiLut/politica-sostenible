import type { Request } from 'express';

export interface JwtTokenPayload {
  sub: string;
  tenantId: string;
  email?: string;
  role?: string;
  sessionVersion?: string;
  authVersion?: number;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
  /** Server-validated credential version; never copied from request input. */
  authVersion?: number;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: Date | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
