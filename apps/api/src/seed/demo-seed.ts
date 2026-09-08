import 'dotenv/config';
import {
  Prisma,
  PrismaClient,
  TenantType,
  PoliticalOperationMode,
  Role,
  DivisionType,
  ConsentPurpose,
  ProposalCategory,
  ProposalStatus,
  TaskStatus,
  WorkPriority,
  CampaignEventStatus,
  EntryType,
  CneCode,
  FinanceStatus,
} from '../../prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import pg from 'pg';

const DEMO_TENANT_SLUG = 'alcaldia-bucaramanga-2027';
const DEMO_ADMIN_EMAIL = 'demo@politicasostenible.co';
const DEMO_DATABASE_MARKER = /(?:^|[-_.])demo(?:$|[-_.])/i;
const MINIMUM_DEMO_PASSWORD_BYTES = 20;

type DemoSeedEnvironment = NodeJS.ProcessEnv;

export interface DemoSeedConfig {
  connectionString: string;
  databaseSchema?: string;
  userPassword: string;
}

interface DemoUserDefinition {
  email: string;
  name: string;
  role: Role;
}

interface PreparedDemoIdentity {
  tenant: { id: string; name: string };
  adminUser: { id: string; email: string };
  teamUsers: Array<{ id: string }>;
}

const DEMO_TEAM_USERS: readonly DemoUserDefinition[] = Object.freeze([
  {
    email: 'andrea@demo.co',
    name: 'Andrea López Díaz',
    role: Role.ZONE_COORDINATOR,
  },
  {
    email: 'miguel@demo.co',
    name: 'Miguel Torres Rueda',
    role: Role.ZONE_COORDINATOR,
  },
  {
    email: 'sofia@demo.co',
    name: 'Sofía Ramírez Castro',
    role: Role.VOLUNTEER,
  },
  {
    email: 'diego@demo.co',
    name: 'Diego Herrera Vargas',
    role: Role.AUDITOR,
  },
]);

const DEMO_USERS: readonly DemoUserDefinition[] = Object.freeze([
  {
    email: DEMO_ADMIN_EMAIL,
    name: 'Carlos Mendoza Ruiz',
    role: Role.ADMIN,
  },
  ...DEMO_TEAM_USERS,
]);

function requiredEnvironmentValue(
  environment: DemoSeedEnvironment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} es obligatorio para ejecutar el seed demo`);
  }
  return value;
}

function parseDemoDatabaseTarget(connectionString: string): {
  databaseName: string;
  databaseSchema?: string;
} {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'DEMO_SEED_DATABASE_URL debe ser una URL PostgreSQL válida',
    );
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(
      'DEMO_SEED_DATABASE_URL debe usar postgres:// o postgresql://',
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const databaseSchema = url.searchParams.get('schema')?.trim() || undefined;
  if (!url.hostname || !databaseName) {
    throw new Error(
      'DEMO_SEED_DATABASE_URL debe identificar explícitamente host y base de datos',
    );
  }

  if (
    !DEMO_DATABASE_MARKER.test(databaseName) &&
    (!databaseSchema || !DEMO_DATABASE_MARKER.test(databaseSchema))
  ) {
    throw new Error(
      'La base o el esquema de DEMO_SEED_DATABASE_URL debe incluir el segmento "demo"',
    );
  }

  return { databaseName, databaseSchema };
}

export function resolveDemoSeedConfig(
  environment: DemoSeedEnvironment,
  passwordEnvironmentVariable = 'DEMO_SEED_USER_PASSWORD',
): DemoSeedConfig {
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  if (!['development', 'test'].includes(nodeEnvironment ?? '')) {
    throw new Error(
      'El seed demo solo se permite con NODE_ENV=development o NODE_ENV=test',
    );
  }

  if (environment.DEMO_SEED_ENVIRONMENT?.trim().toLowerCase() !== 'demo') {
    throw new Error(
      'Define DEMO_SEED_ENVIRONMENT=demo para confirmar el entorno aislado',
    );
  }

  if (environment.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Define ALLOW_DEMO_SEED=true para autorizar el seed demo');
  }

  const connectionString = requiredEnvironmentValue(
    environment,
    'DEMO_SEED_DATABASE_URL',
  );
  const { databaseSchema } = parseDemoDatabaseTarget(connectionString);
  const userPassword = requiredEnvironmentValue(
    environment,
    passwordEnvironmentVariable,
  );

  if (Buffer.byteLength(userPassword, 'utf8') < MINIMUM_DEMO_PASSWORD_BYTES) {
    throw new Error(
      `${passwordEnvironmentVariable} debe tener al menos ${MINIMUM_DEMO_PASSWORD_BYTES} bytes`,
    );
  }

  return { connectionString, databaseSchema, userPassword };
}

export async function prepareDemoIdentity(
  prisma: Pick<Prisma.TransactionClient, 'tenant' | 'user'>,
  passwordHash: string,
): Promise<PreparedDemoIdentity> {
  const [existingTenant, existingUsers] = await Promise.all([
    prisma.tenant.findUnique({
      where: { slug: DEMO_TENANT_SLUG },
      select: { id: true, name: true, type: true, defaultMode: true },
    }),
    prisma.user.findMany({
      where: { email: { in: DEMO_USERS.map(({ email }) => email) } },
      select: { id: true, email: true, tenantId: true, role: true },
    }),
  ]);

  if (
    existingTenant &&
    (existingTenant.type !== TenantType.CANDIDACY ||
      existingTenant.defaultMode !== PoliticalOperationMode.CAMPAIGN)
  ) {
    throw new Error(
      'El tenant reservado para el demo tiene un tipo o modo inesperado; el seed no lo modifica',
    );
  }

  const foreignUser = existingUsers.find(
    ({ tenantId }) => !existingTenant || tenantId !== existingTenant.id,
  );
  if (foreignUser) {
    throw new Error(
      `El correo demo ${foreignUser.email} ya pertenece a otro tenant; no se modificó ningún usuario`,
    );
  }

  const roleMismatch = existingUsers.find(({ email, role }) => {
    const expectedRole = DEMO_USERS.find((user) => user.email === email)?.role;
    return expectedRole !== role;
  });
  if (roleMismatch) {
    throw new Error(
      `El usuario demo ${roleMismatch.email} tiene un rol distinto; el seed no sobrescribe roles ni credenciales`,
    );
  }

  const tenant =
    existingTenant ??
    (await prisma.tenant.create({
      data: {
        name: 'Campaña Alcaldía Bucaramanga 2027',
        slug: DEMO_TENANT_SLUG,
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true, name: true },
    }));

  const usersByEmail = new Map(
    existingUsers.map((user) => [
      user.email,
      { id: user.id, email: user.email },
    ]),
  );
  for (const definition of DEMO_USERS) {
    if (usersByEmail.has(definition.email)) continue;

    const created = await prisma.user.create({
      data: {
        email: definition.email,
        password: passwordHash,
        name: definition.name,
        role: definition.role,
        tenantId: tenant.id,
      },
      select: { id: true, email: true },
    });
    usersByEmail.set(definition.email, created);
  }

  const adminUser = usersByEmail.get(DEMO_ADMIN_EMAIL);
  if (!adminUser) {
    throw new Error('No fue posible preparar el administrador demo');
  }

  return {
    tenant,
    adminUser,
    teamUsers: DEMO_TEAM_USERS.map(({ email }) => {
      const user = usersByEmail.get(email);
      if (!user) throw new Error(`No fue posible preparar ${email}`);
      return { id: user.id };
    }),
  };
}

export async function seedDemo(
  prisma: PrismaClient,
  config: DemoSeedConfig,
): Promise<void> {
  console.log('Starting demo seed...');

  const passwordHash = await bcrypt.hash(config.userPassword, 12);
  await prisma.$transaction(
    async (transaction) => {
      const identity = await prepareDemoIdentity(transaction, passwordHash);
      await populateDemoData(transaction, identity);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

async function populateDemoData(
  prisma: Prisma.TransactionClient,
  { tenant, adminUser, teamUsers }: PreparedDemoIdentity,
): Promise<void> {
  console.log(`✅ Tenant created/found: ${tenant.name}`);

  // Delete existing demo data for this tenant to be idempotent
  console.log('Cleaning up old demo data...');
  await prisma.financialEntry.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.campaignEvent.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.task.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.politicalProposal.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.consentRecord.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.voter.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.politicalDivision.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.consentNotice.deleteMany({ where: { tenantId: tenant.id } });
  console.log(`✅ Admin user ready: ${adminUser.email}`);

  // 3. Team Members
  console.log(`✅ Prepared ${teamUsers.length} team members`);

  // 4. Consent Notice
  await prisma.consentNotice.create({
    data: {
      tenantId: tenant.id,
      mode: PoliticalOperationMode.CAMPAIGN,
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      version: '2026-v1',
      title: 'Aviso de privacidad — Campaña Alcaldía 2027',
      content:
        'De acuerdo con la Ley 1581 de 2012 de Protección de Datos Personales de Colombia, autorizo el tratamiento de mis datos personales para fines de comunicación política y gestión de campaña.',
      controllerName: 'Campaña Alcaldía Bucaramanga 2027',
      contactEmail: 'privacidad@politicasostenible.co',
      isActive: true,
      createdById: adminUser.id,
    },
  });
  console.log(`✅ Created consent notice`);

  // 5. Political Divisions
  const zones = ['Zona Norte', 'Zona Centro', 'Zona Sur'];
  const createdZones: Array<{ id: string }> = [];
  for (let i = 0; i < zones.length; i++) {
    const z = await prisma.politicalDivision.create({
      data: {
        tenantId: tenant.id,
        name: zones[i],
        code: `Z${i + 1}`,
        type: DivisionType.ZONA,
      },
    });
    createdZones.push(z);
  }
  console.log(`✅ Created 3 zones`);

  // 6. Voters/Contacts
  const firstNames = [
    'Juan',
    'María',
    'Pedro',
    'Laura',
    'Luis',
    'Ana',
    'Carlos',
    'Marta',
    'Jorge',
    'Lucía',
    'David',
    'Carmen',
    'José',
    'Paula',
    'Andrés',
  ];
  const lastNames = [
    'García',
    'Rodríguez',
    'Gómez',
    'González',
    'López',
    'Martínez',
    'Pérez',
    'Sánchez',
    'Ramírez',
    'Torres',
    'Díaz',
    'Rojas',
    'Vargas',
    'Castro',
    'Muñoz',
  ];

  for (let i = 0; i < 15; i++) {
    await prisma.voter.create({
      data: {
        tenantId: tenant.id,
        documentId: `10${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: firstNames[i],
        lastName: lastNames[i],
        phone: `300${Math.floor(1000000 + Math.random() * 9000000)}`,
        consentAccepted: true,
        termsVersion: '2026-v1',
        registrarId: adminUser.id,
        puestoId: createdZones[i % 3].id,
      },
    });
  }
  console.log(`✅ Created 15 voters`);

  // 7. Proposals
  const proposalInProgress = await prisma.politicalProposal.create({
    data: {
      tenantId: tenant.id,
      referenceCode: 'PROP-001',
      title: 'Pavimentación vía principal comunas del norte',
      description:
        'Proyecto para pavimentar las vías principales de la zona norte.',
      category: ProposalCategory.INFRASTRUCTURE,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
      isPublic: true,
      ownerId: adminUser.id,
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  const proposalProposed = await prisma.politicalProposal.create({
    data: {
      tenantId: tenant.id,
      referenceCode: 'PROP-002',
      title: 'Ampliación del acueducto rural',
      description: 'Mejoras en el acueducto para zonas rurales.',
      category: ProposalCategory.INFRASTRUCTURE,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
      isPublic: true,
      ownerId: adminUser.id,
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  await prisma.politicalProposal.create({
    data: {
      tenantId: tenant.id,
      referenceCode: 'PROP-003',
      title: 'Programa de becas escolares municipales',
      description: 'Becas para estudiantes de colegios públicos.',
      category: ProposalCategory.EDUCATION,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
      isPublic: false,
      ownerId: adminUser.id,
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });
  await prisma.politicalProposal.update({
    where: { id: proposalInProgress.id },
    data: { status: ProposalStatus.PROPOSED },
  });
  await prisma.politicalProposal.update({
    where: { id: proposalInProgress.id },
    data: { status: ProposalStatus.IN_PROGRESS, progressPercent: 60 },
  });
  await prisma.politicalProposal.update({
    where: { id: proposalProposed.id },
    data: { status: ProposalStatus.PROPOSED, progressPercent: 0 },
  });
  console.log(`✅ Created 3 proposals`);

  // 8. Tasks
  const taskTitles = [
    {
      title: 'Reunión JAC vereda El Carmen',
      status: TaskStatus.DONE,
      priority: WorkPriority.HIGH,
    },
    {
      title: 'Diseño volantes sector norte',
      status: TaskStatus.IN_PROGRESS,
      priority: WorkPriority.MEDIUM,
    },
    {
      title: 'Entrega propuesta al concejo',
      status: TaskStatus.TODO,
      priority: WorkPriority.HIGH,
    },
    {
      title: 'Llamadas voluntarios zona centro',
      status: TaskStatus.TODO,
      priority: WorkPriority.LOW,
    },
    {
      title: 'Revisión presupuesto de campaña',
      status: TaskStatus.IN_PROGRESS,
      priority: WorkPriority.URGENT,
    },
    {
      title: 'Preparar debate radial',
      status: TaskStatus.TODO,
      priority: WorkPriority.HIGH,
    },
    {
      title: 'Cotización tarimas',
      status: TaskStatus.DONE,
      priority: WorkPriority.MEDIUM,
    },
    {
      title: 'Capacitación testigos electorales',
      status: TaskStatus.TODO,
      priority: WorkPriority.MEDIUM,
    },
  ];
  for (let i = 0; i < taskTitles.length; i++) {
    const t = taskTitles[i];
    await prisma.task.create({
      data: {
        tenantId: tenant.id,
        mode: PoliticalOperationMode.CAMPAIGN,
        title: t.title,
        status: t.status,
        priority: t.priority,
        createdById: adminUser.id,
        assigneeId: i % 2 === 0 ? teamUsers[0].id : null,
        dueAt: new Date(Date.now() + (i - 2) * 86400000), // Some past, some future
      },
    });
  }
  console.log(`✅ Created 8 tasks`);

  // 9. Events
  const events = [
    {
      name: 'Cabildo abierto Plaza Mayor',
      daysOffset: -5,
      status: CampaignEventStatus.COMPLETED,
    },
    {
      name: 'Recorrido barrial comuna 3',
      daysOffset: -1,
      status: CampaignEventStatus.COMPLETED,
    },
    {
      name: 'Entrevista radio local',
      daysOffset: 0,
      status: CampaignEventStatus.IN_PROGRESS,
    },
    {
      name: 'Debate candidatos emisora local',
      daysOffset: 2,
      status: CampaignEventStatus.SCHEDULED,
    },
    {
      name: 'Cierre de campaña zona sur',
      daysOffset: 15,
      status: CampaignEventStatus.SCHEDULED,
    },
  ];
  for (const e of events) {
    const d = new Date();
    d.setDate(d.getDate() + e.daysOffset);
    d.setHours(10, 0, 0, 0);
    const end = new Date(d);
    end.setHours(12, 0, 0, 0);
    await prisma.campaignEvent.create({
      data: {
        tenantId: tenant.id,
        mode: PoliticalOperationMode.CAMPAIGN,
        name: e.name,
        startsAt: d,
        endsAt: end,
        status: e.status,
        responsibleId: adminUser.id,
      },
    });
  }
  console.log(`✅ Created 5 events`);

  // 10. Financial entries
  const finances = [
    {
      type: EntryType.INCOME,
      amount: 5000000,
      cneCode: CneCode.OTROS,
      description: 'Donación simpatizante',
      vendorName: 'Juan Pérez',
      vendorTaxId: '1098765432',
    },
    {
      type: EntryType.EXPENSE,
      amount: 1500000,
      cneCode: CneCode.ACTOS_PUBLICOS,
      description: 'Alquiler sonido cabildo',
      vendorName: 'Sonido Max S.A.S',
      vendorTaxId: '900123456-1',
    },
    {
      type: EntryType.EXPENSE,
      amount: 2500000,
      cneCode: CneCode.PUBLICIDAD_VALLAS,
      description: 'Impresión volantes y pasacalles',
      vendorName: 'Litografía Central',
      vendorTaxId: '800987654-2',
    },
    {
      type: EntryType.EXPENSE,
      amount: 450000,
      cneCode: CneCode.TRANSPORTE,
      description: 'Transporte recorrido barrial',
      vendorName: 'Transportes Rápidos',
      vendorTaxId: '901234567-3',
    },
    {
      type: EntryType.INCOME,
      amount: 2000000,
      cneCode: CneCode.OTROS,
      description: 'Aporte familiar candidato',
      vendorName: 'Familia Mendoza',
      vendorTaxId: '135792468',
    },
    {
      type: EntryType.EXPENSE,
      amount: 300000,
      cneCode: CneCode.SEDE_CAMPANA,
      description: 'Servicios públicos sede',
      vendorName: 'Electrificadora',
      vendorTaxId: '890200300-4',
    },
  ];
  for (const f of finances) {
    await prisma.financialEntry.create({
      data: {
        tenantId: tenant.id,
        type: f.type,
        amount: f.amount,
        date: new Date(),
        cneCode: f.cneCode,
        description: f.description,
        vendorName: f.vendorName,
        vendorTaxId: f.vendorTaxId,
        reporterId: adminUser.id,
        status: FinanceStatus.APPROVED,
      },
    });
  }
  console.log(`✅ Created 6 financial entries`);

  // 11. Campaign Settings & Operation Profile
  await prisma.campaignSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      maxTotalBudget: 150000000,
      maxPublicityLimit: 50000000,
    },
    create: {
      tenantId: tenant.id,
      maxTotalBudget: 150000000,
      maxPublicityLimit: 50000000,
    },
  });

  await prisma.operationProfile.upsert({
    where: { tenantId: tenant.id },
    update: {
      electionDate: new Date('2027-10-29T13:00:00Z'),
    },
    create: {
      tenantId: tenant.id,
      operationType: 'SINGLE_CANDIDACY',
      stage: 'CAMPAIGN',
      electionType: 'MAYORALTY',
      circumscriptionType: 'MUNICIPAL',
      circumscriptionName: 'Bucaramanga',
      electionDate: new Date('2027-10-29T13:00:00Z'),
      expectedTeamSize: 50,
      dataControllerName: 'Campaña Alcaldía Bucaramanga 2027',
      responsibleDataUserId: adminUser.id,
      retentionPeriodDays: 365,
      revocationProcedure: 'Contactar a privacidad@politicasostenible.co',
      createdById: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  console.log(`✅ Campaign settings & Operation Profile updated`);
  console.log('🎉 Demo seed finished successfully!');
}

async function main(): Promise<void> {
  const config = resolveDemoSeedConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.connectionString });
  const adapter = new PrismaPg(
    pool,
    config.databaseSchema ? { schema: config.databaseSchema } : undefined,
  );
  const prisma = new PrismaClient({ adapter });

  try {
    await seedDemo(prisma, config);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Falló el seed demo',
    );
    process.exitCode = 1;
  });
}
