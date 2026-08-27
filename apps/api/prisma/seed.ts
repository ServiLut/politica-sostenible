import { PrismaClient, Role, TenantType } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import pg from "pg";
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para el seed local`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("El seed de desarrollo está bloqueado en producción");
  }

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Define ALLOW_DEMO_SEED=true para autorizar este seed local");
  }

  const connectionString =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DIRECT_URL o DATABASE_URL es obligatorio");
  }

  const password = required("SEED_ADMIN_PASSWORD");
  if (Buffer.byteLength(password, "utf8") < 12) {
    throw new Error("SEED_ADMIN_PASSWORD debe tener al menos 12 bytes");
  }

  const pool = new pg.Pool({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: "local-development" },
      update: {},
      create: {
        slug: "local-development",
        name: "Organización local de desarrollo",
        type: TenantType.GSC,
      },
    });

    const email =
      process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() ||
      "admin@politica-sostenible.test";
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.upsert({
      where: { email },
      update: {
        password: passwordHash,
        tenantId: tenant.id,
        role: Role.ADMIN,
      },
      create: {
        email,
        password: passwordHash,
        name: "Administración local",
        role: Role.ADMIN,
        documentId: process.env.SEED_ADMIN_DOCUMENT?.trim() || "DEV-ADMIN",
        tenantId: tenant.id,
      },
    });

    console.log(
      `Seed local listo para ${email}; no se crearon ciudadanos ficticios.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falló el seed local");
  process.exitCode = 1;
});
