import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IssueCaseStatus, Role } from '../../prisma/generated/prisma';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

describe('CasesController route parameter transport', () => {
  let app: INestApplication<App>;
  const user: AuthenticatedUser = {
    userId: 'ckl0z7u4f0000qzrmn831i7rn',
    tenantId: 'ckl0z7u4f0001qzrmn831i7rn',
    role: Role.CAMPAIGN_MANAGER,
  };
  const cases = { findOne: jest.fn(), update: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CasesController],
      providers: [{ provide: CasesService, useValue: cases }],
    }).compile();
    app = module.createNestApplication();
    // This fixture isolates parameter validation; real JWT/RBAC are exercised
    // separately by the application HTTP integration and QA role workflows.
    app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.user = user;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it.each([
    'ckl0z7u4f0002qzrmn831i7rn',
    'df774561-9738-4d8b-98ea-c8d304b38dd3',
  ])(
    'passes persisted case %s and trusted identity to both routes',
    async (id) => {
      cases.findOne.mockResolvedValue({ id, status: IssueCaseStatus.OPEN });
      cases.update.mockResolvedValue({ id, status: IssueCaseStatus.TRIAGED });
      await request(app.getHttpServer())
        .get('/cases/' + id)
        .expect(200);
      expect(cases.findOne).toHaveBeenCalledWith(user, id);
      await request(app.getHttpServer())
        .patch('/cases/' + id)
        .send({ status: IssueCaseStatus.TRIAGED })
        .expect(200);
      expect(cases.update).toHaveBeenCalledWith(user, id, {
        status: IssueCaseStatus.TRIAGED,
      });
    },
  );

  it('rejects malformed identifiers before either service query', async () => {
    await request(app.getHttpServer()).get('/cases/arbitrary-id').expect(400);
    await request(app.getHttpServer())
      .patch('/cases/arbitrary-id')
      .send({ status: IssueCaseStatus.TRIAGED })
      .expect(400);
    expect(cases.findOne).not.toHaveBeenCalled();
    expect(cases.update).not.toHaveBeenCalled();
  });

  it('still rejects a client-supplied tenant when updating a UUID case', async () => {
    await request(app.getHttpServer())
      .patch('/cases/df774561-9738-4d8b-98ea-c8d304b38dd3')
      .send({ status: IssueCaseStatus.TRIAGED, tenantId: 'another-tenant' })
      .expect(400);
    expect(cases.update).not.toHaveBeenCalled();
  });
});
