import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/u;

type CorrelatedRequest = Request & { requestId?: string };

export function resolveRequestId(candidate: unknown): string {
  return typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.header('x-request-id'));
  (request as CorrelatedRequest).requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}

export function getRequestId(request: Request): string | undefined {
  const requestId = (request as CorrelatedRequest).requestId;
  return requestId && REQUEST_ID_PATTERN.test(requestId)
    ? requestId
    : undefined;
}
