import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

describe('schema-45 recovery import admission', () => {
  let app: INestApplication;
  const service = { preview: jest.fn(), execute: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [{ provide: ImportService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['post', '/import/voters/preview'],
    ['post', '/import/voters/execute'],
    ['get', '/import/voters/template'],
  ] as const)(
    'blocks %s %s before any import service call',
    async (method, path) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('x-recovery-override', 'false')
        .send({ csv: 'untrusted', recoveryMode: false })
        .expect(503);
      expect(response.body.code).toBe('IMPORT_SUSPENDED_FOR_RECOVERY');
      expect(service.preview).not.toHaveBeenCalled();
      expect(service.execute).not.toHaveBeenCalled();
    },
  );

  it('does not expose the durable bulk job controller', async () => {
    await request(app.getHttpServer()).get('/import/personas/jobs').expect(404);
    await request(app.getHttpServer())
      .post('/import/personas/jobs')
      .send({})
      .expect(404);
  });
});
