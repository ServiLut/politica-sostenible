import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// Jest's CommonJS sandbox cannot execute otplib's transitive ESM-only base32
// dependency. MFA behavior is covered by its focused service tests; this suite
// verifies that the complete Nest module graph boots and serves HTTP.
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'TESTONLYBASE32SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/test-only'),
  verifySync: jest.fn(() => ({
    valid: true,
    delta: 0,
    epoch: 1_800_000_000,
    timeStep: 60_000_000,
  })),
}));

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Política Sostenible API');
  });
});
