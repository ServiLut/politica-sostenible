import 'dotenv/config';
import {
  PoliticalOperationMode,
  Prisma,
  PrismaClient,
  Role,
  TenantType,
} from './generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import pg from 'pg';
import {
  resolveDemoSeedConfig,
  type DemoSeedConfig,
} from '../src/seed/demo-seed';

const LOCAL_TENANT_SLUG = 'local-development';

export interface LocalSeedIdentityOptions {
  email: string;
  documentId: string;
  passwordHash: string;
}

interface PreparedLocalSeedIdentity {
  email: string;
  wasCreated: boolean;
}

export async function prepareLocalSeedIdentity(
  prisma: Pick<Prisma.TransactionClient, 'tenant' | 'user'>,
  options: LocalSeedIdentityOptions,
): Promise<PreparedLocalSeedIdentity> {
  const [existingTenant, existingUser] = await Promise.all([
    prisma.tenant.findUnique({
      where: { slug: LOCAL_TENANT_SLUG },
      select: { id: true, type: true, defaultMode: true },
    }),
    prisma.user.findUnique({
      where: { email: options.email },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        isActive: true,
      },
    }),
  ]);

  if (
    existingTenant &&
    (existingTenant.type !== TenantType.GSC ||
      existingTenant.defaultMode !== PoliticalOperationMode.CAMPAIGN)
  ) {
    throw new Error(
      'El tenant local reservado tiene un tipo o modo inesperado; el seed no lo modifica',
    );
  }

  if (
    existingUser &&
    (!existingTenant || existingUser.tenantId !== existingTenant.id)
  ) {
    throw new Error(
      `El correo ${existingUser.email} ya pertenece a otro tenant; el seed no reasigna usuarios`,
    );
  }

  if (
    existingUser &&
    (existingUser.role !== Role.ADMIN || !existingUser.isActive)
  ) {
    throw new Error(
      `El usuario ${existingUser.email} no coincide con la identidad local esperada; el seed no sobrescribe rol ni estado`,
    );
  }

  const tenant =
    existingTenant ??
    (await prisma.tenant.create({
      data: {
        slug: LOCAL_TENANT_SLUG,
        name: 'Organización local de desarrollo',
        type: TenantType.GSC,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true },
    }));

  if (existingUser) {
    return { email: existingUser.email, wasCreated: false };
  }

  const createdUser = await prisma.user.create({
    data: {
      email: options.email,
      password: options.passwordHash,
      name: 'Administración local',
      role: Role.ADMIN,
      documentId: options.documentId,
      tenantId: tenant.id,
    },
    select: { email: true },
  });

  return { email: createdUser.email, wasCreated: true };
}

export async function seedLocalDevelopment(
  prisma: PrismaClient,
  config: DemoSeedConfig,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const email =
    environment.SEED_ADMIN_EMAIL?.trim().toLowerCase() ||
    'admin@politica-sostenible.test';
  const documentId = environment.SEED_ADMIN_DOCUMENT?.trim() || 'DEV-ADMIN';
  const passwordHash = await bcrypt.hash(config.userPassword, 12);

  const identity = await prisma.$transaction(
    (transaction) =>
      prepareLocalSeedIdentity(transaction, {
        email,
        documentId,
        passwordHash,
      }),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  const action = identity.wasCreated
    ? 'creado con la credencial suministrada'
    : 'preservado sin cambiar tenant, rol ni credencial';
  console.log(`Seed local listo para ${identity.email}; usuario ${action}.`);
}

async function main(): Promise<void> {
  const config = resolveDemoSeedConfig(process.env, 'SEED_ADMIN_PASSWORD');
  const pool = new pg.Pool({ connectionString: config.connectionString });
  const adapter = new PrismaPg(
    pool,
    config.databaseSchema ? { schema: config.databaseSchema } : undefined,
  );
  const prisma = new PrismaClient({ adapter });

  try {
    await seedLocalDevelopment(prisma, config, process.env);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Falló el seed local',
    );
    process.exitCode = 1;
  });
}
