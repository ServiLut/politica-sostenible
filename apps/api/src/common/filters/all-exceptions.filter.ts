import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getRequestId } from '../http/request-id';

const PUBLIC_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/u;
const PUBLIC_STAGE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u;

interface PublicErrorMetadata {
  readonly code?: string;
  readonly currentStage?: string | null;
  readonly allowedStages?: string[];
  readonly blockers?: string[];
  readonly closureType?: string | null;
}

function safeEnumArray(value: unknown, maximum: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: unknown[] = value;
  if (
    entries.length > maximum ||
    !entries.every(
      (entry): entry is string =>
        typeof entry === 'string' && PUBLIC_STAGE_PATTERN.test(entry),
    )
  ) {
    return undefined;
  }
  return entries;
}

function publicErrorMetadata(
  responseBody: Record<string, unknown>,
): PublicErrorMetadata {
  const metadata: {
    code?: string;
    currentStage?: string | null;
    allowedStages?: string[];
    blockers?: string[];
    closureType?: string | null;
  } = {};

  if (
    typeof responseBody.code === 'string' &&
    PUBLIC_ERROR_CODE_PATTERN.test(responseBody.code)
  ) {
    metadata.code = responseBody.code;
  }
  if (
    responseBody.currentStage === null ||
    (typeof responseBody.currentStage === 'string' &&
      PUBLIC_STAGE_PATTERN.test(responseBody.currentStage))
  ) {
    metadata.currentStage = responseBody.currentStage;
  }
  const allowedStages = safeEnumArray(responseBody.allowedStages, 16);
  if (allowedStages) metadata.allowedStages = allowedStages;
  const blockers = safeEnumArray(responseBody.blockers, 64);
  if (blockers) metadata.blockers = blockers;
  if (
    responseBody.closureType === null ||
    (typeof responseBody.closureType === 'string' &&
      PUBLIC_STAGE_PATTERN.test(responseBody.closureType))
  ) {
    metadata.closureType = responseBody.closureType;
  }

  return metadata;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId(request);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string = 'Error interno del servidor';
    let publicMetadata: PublicErrorMetadata = {};
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const bodyRecord = body as Record<string, unknown>;
        publicMetadata = publicErrorMetadata(bodyRecord);
        if (Array.isArray(bodyRecord.message)) {
          message = bodyRecord.message.join('. ') + '.';
        } else if (typeof bodyRecord.message === 'string') {
          message = bodyRecord.message;
        }
      }
    }

    const exceptionType =
      exception instanceof Error ? exception.constructor.name : 'UnknownError';
    const logMessage =
      `HTTP response: ${status} - Method: ${request.method} - ` +
      `Path: ${request.path} - Type: ${exceptionType} - ` +
      `RequestId: ${requestId ?? 'unavailable'}`;

    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(logMessage);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...publicMetadata,
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      path: request.path,
    });
  }
}
