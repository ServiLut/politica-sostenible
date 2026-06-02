import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Request, Response, NextFunction } from 'express';
import { winstonConfig } from './common/logger/winston.config';
import { randomUUID } from 'crypto';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

type RateLimitRule = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: RegExp;
  limit: number;
  windowMs: number;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonConfig,
  });

  const logger = new Logger('HTTP');
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  const rules: RateLimitRule[] = [
    { method: 'POST', path: /^\/auth\/login$/, limit: 10, windowMs: 60_000 },
    {
      method: 'POST',
      path: /^\/auth\/register$/,
      limit: 5,
      windowMs: 10 * 60_000,
    },
    {
      method: 'POST',
      path: /^\/files\/upload-url$/,
      limit: 30,
      windowMs: 60_000,
    },
    {
      method: 'POST',
      path: /^\/files\/confirm-upload$/,
      limit: 60,
      windowMs: 60_000,
    },
    { method: 'POST', path: /^\/finance$/, limit: 40, windowMs: 60_000 },
    {
      method: 'PATCH',
      path: /^\/finance\/[^/]+$/,
      limit: 60,
      windowMs: 60_000,
    },
    {
      method: 'DELETE',
      path: /^\/finance\/[^/]+$/,
      limit: 30,
      windowMs: 60_000,
    },
    { method: 'POST', path: /^\/voters$/, limit: 80, windowMs: 60_000 },
    {
      method: 'PATCH',
      path: /^\/voters\/[^/]+$/,
      limit: 120,
      windowMs: 60_000,
    },
    {
      method: 'GET',
      path: /^\/files\/audit-logs$/,
      limit: 120,
      windowMs: 60_000,
    },
  ];
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let requestCountSinceCleanup = 0;

  // Basic security headers + route-level in-memory rate limit.
  // Note: in-memory counters are per instance; replace with Redis for multi-instance deployments.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('x-request-id')?.trim() || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    const matchingRule = rules.find(
      (rule) => rule.method === req.method && rule.path.test(req.path),
    );

    if (matchingRule) {
      const key = `${req.ip}:${matchingRule.method}:${matchingRule.path.source}`;
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || now > bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + matchingRule.windowMs });
      } else if (bucket.count >= matchingRule.limit) {
        const retryAfter = Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        );
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          success: false,
          message: 'Too many requests',
          retryAfterSeconds: retryAfter,
        });
      } else {
        bucket.count += 1;
        buckets.set(key, bucket);
      }
    }

    requestCountSinceCleanup += 1;
    if (requestCountSinceCleanup >= 1000) {
      const now = Date.now();
      for (const [key, value] of buckets.entries()) {
        if (now > value.resetAt) {
          buckets.delete(key);
        }
      }
      requestCountSinceCleanup = 0;
    }

    const { method, url, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      logger.log(
        `${method} ${url} ${statusCode} - ${userAgent} ${ip} +${duration}ms rid=${requestId}`,
      );
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

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Request-Id',
      'X-Forwarded-For',
      'X-Real-IP',
      'User-Agent',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
