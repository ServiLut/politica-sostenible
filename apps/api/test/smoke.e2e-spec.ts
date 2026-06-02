import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Smoke (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /auth/me should reject unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /operations/state should reject unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/operations/state').expect(401);
  });

  it('GET /files should reject unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/files').expect(401);
  });

  it('POST /files/upload-url should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/files/upload-url')
      .send({
        module: 'campaign',
        fileName: 'example.pdf',
        contentType: 'application/pdf',
      })
      .expect(401);
  });

  it('POST /finance/validate should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/finance/validate')
      .send({
        amount: 100000,
        category: 'OPERATIVO',
      })
      .expect(401);
  });
});
