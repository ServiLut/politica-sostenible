import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string = 'Error interno del servidor';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const bodyRecord = body as Record<string, unknown>;
        if (Array.isArray(bodyRecord.message)) {
          message = bodyRecord.message.join('. ') + '.';
        } else if (typeof bodyRecord.message === 'string') {
          message = bodyRecord.message;
        }
      }
    }

    const exceptionType =
      exception instanceof Error ? exception.constructor.name : 'UnknownError';
    this.logger.error(
      `HTTP Error: ${status} - Method: ${request.method} - Path: ${request.path} - Type: ${exceptionType}`,
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.path,
    });
  }
}
