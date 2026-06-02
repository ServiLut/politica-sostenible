import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../prisma/generated/prisma';

type AuthContext = {
  token: string;
  tenantId: string;
};

function unwrapPayload<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') return payload as T;
  const record = payload as Record<string, unknown>;
  return (record.data ?? payload) as T;
}

describe('Role Access (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const registerAndLoginAdmin = async (suffix: string): Promise<AuthContext> => {
    const uid = `${Date.now()}-${Math.floor(Math.random() * 100000)}-${suffix}`;
    const email = `rbac.${uid}@example.com`;
    const password = 'Passw0rd!123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        name: `RBAC ${suffix}`,
        documentId: `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const loginData = unwrapPayload<{
      access_token: string;
      user: { tenant: { id: string } };
    }>(loginRes.body);

    return {
      token: loginData.access_token,
      tenantId: loginData.user.tenant.id,
    };
  };

  const createAndLoginUserWithRole = async (
    tenantId: string,
    role: Role,
    suffix: string,
  ): Promise<string> => {
    const uid = `${Date.now()}-${Math.floor(Math.random() * 100000)}-${suffix}`;
    const email = `rbac.user.${uid}@example.com`;
    const password = 'Passw0rd!123';
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: `User ${suffix}`,
        documentId: `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
        tenantId,
        role,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const loginData = unwrapPayload<{ access_token: string }>(loginRes.body);
    return loginData.access_token;
  };

  it('VOLUNTEER should not create finance records', async () => {
    const admin = await registerAndLoginAdmin('volunteer-finance');
    const volunteerToken = await createAndLoginUserWithRole(
      admin.tenantId,
      Role.VOLUNTEER,
      'volunteer',
    );

    await request(app.getHttpServer())
      .post('/finance')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        type: 'EXPENSE',
        amount: 100000,
        date: new Date().toISOString(),
        cneCode: 'OTROS',
        description: 'Intento sin permisos',
        vendorName: 'Proveedor',
        vendorTaxId: '900123456',
      })
      .expect(403);
  });

  it('ZONE_COORDINATOR should read finance but not delete entries', async () => {
    const admin = await registerAndLoginAdmin('coordinator-finance');
    const coordinatorToken = await createAndLoginUserWithRole(
      admin.tenantId,
      Role.ZONE_COORDINATOR,
      'coordinator',
    );

    const createdRes = await request(app.getHttpServer())
      .post('/finance')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        type: 'EXPENSE',
        amount: 150000,
        date: new Date().toISOString(),
        cneCode: 'OTROS',
        description: 'Gasto inicial',
        vendorName: 'Proveedor Legal',
        vendorTaxId: '900123456',
      })
      .expect(201);

    const created = unwrapPayload<{ id: string }>(createdRes.body);

    await request(app.getHttpServer())
      .get('/finance')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/finance/${created.id}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(403);
  });

  it('VOLUNTEER should read operations intelligence but not update operations state', async () => {
    const admin = await registerAndLoginAdmin('volunteer-ops');
    const volunteerToken = await createAndLoginUserWithRole(
      admin.tenantId,
      Role.VOLUNTEER,
      'volunteer-ops',
    );

    await request(app.getHttpServer())
      .get('/operations/intelligence')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put('/operations/state')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        campaignGoal: 90000,
      })
      .expect(403);
  });

  it('VOLUNTEER should not create voters', async () => {
    const admin = await registerAndLoginAdmin('volunteer-voter');
    const volunteerToken = await createAndLoginUserWithRole(
      admin.tenantId,
      Role.VOLUNTEER,
      'volunteer-voter',
    );

    await request(app.getHttpServer())
      .post('/voters')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        documentId: `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
        firstName: 'Ana',
        lastName: 'Lopez',
      })
      .expect(403);
  });

  it('should protect logistics voting routes and still allow witnesses to read them', async () => {
    const admin = await registerAndLoginAdmin('witness-war-room');
    const witnessToken = await createAndLoginUserWithRole(
      admin.tenantId,
      Role.WITNESS,
      'witness-war-room',
    );

    await request(app.getHttpServer())
      .get('/logistics/voting-places')
      .expect(401);

    await request(app.getHttpServer())
      .get('/logistics/voting-places')
      .set('Authorization', `Bearer ${witnessToken}`)
      .expect(200);
  });

  it('should protect witness listing without authentication', async () => {
    await request(app.getHttpServer()).get('/witnesses').expect(401);
  });
});
