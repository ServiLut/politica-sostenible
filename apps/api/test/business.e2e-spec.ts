import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

type AuthContext = {
  token: string;
};

function unwrapPayload<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') return payload as T;
  const record = payload as Record<string, unknown>;
  return (record.data ?? payload) as T;
}

describe('Business Flows (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const createAuthContext = async (label: string): Promise<AuthContext> => {
    const uid = `${Date.now()}-${Math.floor(Math.random() * 100000)}-${label}`;
    const email = `qa.${uid}@example.com`;
    const password = 'Passw0rd!123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        name: `QA ${label}`,
        documentId: `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
        phone: '3000000000',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const loginData = unwrapPayload<{ access_token: string }>(loginRes.body);
    return {
      token: loginData.access_token,
    };
  };

  const getIntelligence = async (token: string) => {
    const res = await request(app.getHttpServer())
      .get('/operations/intelligence')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return unwrapPayload<{
      alerts: Array<{ id: string; module: string }>;
      adoption: {
        events7d: number;
        modulesUsed7d: number;
        activeUsers7d: number;
      };
      health: {
        voters: number;
        expenseExecutionPercentage: number;
        tasksOverdue: number;
        complianceOverdue: number;
      };
    }>(res.body);
  };

  it('should reflect new voter records in operational intelligence automatically', async () => {
    const auth = await createAuthContext('voters');
    const before = await getIntelligence(auth.token);

    await request(app.getHttpServer())
      .post('/voters')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        documentId: `${Math.floor(1000000000 + Math.random() * 8999999999)}`,
        firstName: 'Carlos',
        lastName: 'Ruiz',
        phone: '3001112233',
        psychographicData: {
          stage: 'Prospecto',
          role: 'Simpatizante',
        },
      })
      .expect(201);

    const after = await getIntelligence(auth.token);
    expect(after.health.voters).toBeGreaterThanOrEqual(
      before.health.voters + 1,
    );
    expect(Array.isArray(after.alerts)).toBe(true);
    expect(after.alerts.length).toBeGreaterThan(0);
  });

  it('should detect financial risk alerts after high expense registration', async () => {
    const auth = await createAuthContext('finance');

    await request(app.getHttpServer())
      .post('/finance')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        type: 'EXPENSE',
        amount: 400000000,
        date: new Date().toISOString(),
        cneCode: 'OTROS',
        description: 'Compra logística principal',
        vendorName: 'Proveedor Logistico SAS',
        vendorTaxId: '900123456',
      })
      .expect(201);

    const intelligence = await getIntelligence(auth.token);
    expect(
      intelligence.health.expenseExecutionPercentage,
    ).toBeGreaterThanOrEqual(80);
    expect(
      intelligence.alerts.some(
        (alert) =>
          alert.id === 'int-finance-warning' ||
          alert.id === 'int-finance-high-risk',
      ),
    ).toBe(true);
  });

  it('should compute adoption and overdue operation risks from real generated activity', async () => {
    const auth = await createAuthContext('adoption');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .put('/operations/state')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        tasks: [
          {
            id: `task-${Date.now()}`,
            title: 'Visitar líderes barriales',
            type: 'Puerta a Puerta',
            assignedTo: 'Coordinación',
            status: 'Pendiente',
            deadline: yesterday,
            progress: 0,
            description: 'Plan de visita por comunas',
          },
        ],
        compliance: [
          {
            id: `comp-${Date.now()}`,
            title: 'Soporte de publicidad exterior',
            deadline: yesterday,
            status: 'Pendiente',
            priority: 'Alta',
            type: 'Publicidad Exterior',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/files/audit-logs')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        actor: 'QA Operador',
        action: 'Registro de seguimiento financiero',
        module: 'Finanzas',
        severity: 'Info',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/files/audit-logs')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        actor: 'QA Operador',
        action: 'Actualización de embudo territorial',
        module: 'Votantes',
        severity: 'Warning',
      })
      .expect(201);

    const intelligence = await getIntelligence(auth.token);
    expect(intelligence.adoption.events7d).toBeGreaterThanOrEqual(2);
    expect(intelligence.adoption.modulesUsed7d).toBeGreaterThanOrEqual(2);
    expect(intelligence.adoption.activeUsers7d).toBeGreaterThanOrEqual(1);
    expect(intelligence.health.tasksOverdue).toBeGreaterThanOrEqual(1);
    expect(intelligence.health.complianceOverdue).toBeGreaterThanOrEqual(1);
  });
});
