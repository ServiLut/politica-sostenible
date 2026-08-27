import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Request, Response, NextFunction } from 'express';
import { winstonConfig } from './common/logger/winston.config';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export function resolveCorsOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configuredOrigins =
    environment.CORS_ORIGINS ?? environment.NEXT_PUBLIC_APP_URL;

  if (!configuredOrigins?.trim()) {
    if (environment.NODE_ENV === 'production') {
      throw new Error(
        'CORS_ORIGINS es obligatorio en producción (lista separada por comas)',
      );
    }

    return ['http://localhost:3000'];
  }

  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === '*') {
        throw new Error('CORS_ORIGINS no puede contener comodines');
      }

      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Origen CORS no permitido: ${origin}`);
      }

      if (
        environment.NODE_ENV === 'production' &&
        parsed.protocol !== 'https:'
      ) {
        throw new Error(`El origen CORS debe usar HTTPS: ${origin}`);
      }

      if (
        (parsed.pathname && parsed.pathname !== '/') ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(`El origen CORS no debe contener rutas: ${origin}`);
      }

      return parsed.origin;
    });

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS debe contener al menos un origen válido');
  }

  return [...new Set(origins)];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonConfig,
  });
  app.set('trust proxy', 1);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader(
      'Permissions-Policy',
      'camera=(), geolocation=(), microphone=()',
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  const logger = new Logger('HTTP');

  // Structured Logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const { method, path } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      logger.log(`${method} ${path} ${statusCode} +${duration}ms`);
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  const corsOrigins = resolveCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 600,
  });
  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
