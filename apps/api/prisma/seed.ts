import { PrismaClient } from './generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Iniciando seeding de la Campaña Presidencial 2026...');

  // 1. Tenant Principal
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'victoria-colombia-2026' },
    update: {},
    create: {
      slug: 'victoria-colombia-2026',
      name: 'Victoria Colombia 2026',
      type: 'GSC',
    },
  });

  // 2. Departamentos de Colombia (DIVIPOLA)
  const departamentos = [
    { code: '05', name: 'ANTIOQUIA' },
    { code: '08', name: 'ATLÁNTICO' },
    { code: '11', name: 'BOGOTÁ, D.C.' },
    { code: '13', name: 'BOLÍVAR' },
    { code: '15', name: 'BOYACÁ' },
    { code: '17', name: 'CALDAS' },
    { code: '18', name: 'CAQUETÁ' },
    { code: '19', name: 'CAUCA' },
    { code: '20', name: 'CESAR' },
    { code: '23', name: 'CÓRDOBA' },
    { code: '25', name: 'CUNDINAMARCA' },
    { code: '27', name: 'CHOCÓ' },
    { code: '41', name: 'HUILA' },
    { code: '44', name: 'LA GUAJIRA' },
    { code: '47', name: 'MAGDALENA' },
    { code: '50', name: 'META' },
    { code: '52', name: 'NARIÑO' },
    { code: '54', name: 'NORTE DE SANTANDER' },
    { code: '63', name: 'QUINDÍO' },
    { code: '66', name: 'RISARALDA' },
    { code: '68', name: 'SANTANDER' },
    { code: '70', name: 'SUCRE' },
    { code: '73', name: 'TOLIMA' },
    { code: '76', name: 'VALLE DEL CAUCA' },
    { code: '81', name: 'ARAUCA' },
    { code: '85', name: 'CASANARE' },
    { code: '86', name: 'PUTUMAYO' },
    { code: '88', name: 'SAN ANDRÉS' },
    { code: '91', name: 'AMAZONAS' },
    { code: '94', name: 'GUAINÍA' },
    { code: '95', name: 'GUAVIARE' },
    { code: '97', name: 'VAUPÉS' },
    { code: '99', name: 'VICHADA' },
  ];

  console.log('📍 Cargando departamentos...');
  for (const dep of departamentos) {
    await prisma.politicalDivision.upsert({
      where: { code_type: { code: dep.code, type: 'DEPARTAMENTO' } },
      update: { name: dep.name },
      create: {
        code: dep.code,
        name: dep.name,
        type: 'DEPARTAMENTO',
        tenantId: tenant.id,
      },
    });
  }

  // 3. Municipios Clave
  const municipiosClave = [
    { code: '11001', name: 'BOGOTÁ, D.C.', parentCode: '11' },
    { code: '05001', name: 'MEDELLÍN', parentCode: '05' },
    { code: '76001', name: 'CALI', parentCode: '76' },
  ];

  console.log('📍 Cargando municipios clave...');
  const munIds: Record<string, string> = {};
  for (const mun of municipiosClave) {
    const parent = await prisma.politicalDivision.findUnique({
      where: { code_type: { code: mun.parentCode, type: 'DEPARTAMENTO' } },
    });

    const m = await prisma.politicalDivision.upsert({
      where: { code_type: { code: mun.code, type: 'MUNICIPIO' } },
      update: { name: mun.name },
      create: {
        code: mun.code,
        name: mun.name,
        type: 'MUNICIPIO',
        parentId: parent?.id,
        tenantId: tenant.id,
      },
    });
    munIds[mun.name] = m.id;
  }

  // 4. Puestos de Votación (100 simulados)
  console.log('🗳️ Generando 100 puestos de votación...');
  const cities = ['BOGOTÁ, D.C.', 'MEDELLÍN', 'CALI'];
  for (let i = 1; i <= 100; i++) {
    const city = cities[i % 3];
    await prisma.politicalDivision.create({
      data: {
        code: `PUESTO-${i.toString().padStart(3, '0')}`,
        name: `Puesto ${i} - ${city}`,
        type: 'PUESTO',
        parentId: munIds[city],
        tenantId: tenant.id,
      },
    });
  }

  // 5. Usuario Voluntario (para registrar votantes)
  const volunteer = await prisma.user.upsert({
    where: { email: 'voluntario@victoria2026.com' },
    update: {},
    create: {
      email: 'voluntario@victoria2026.com',
      password: 'hash_password_here', // En producción usar bcrypt
      name: 'Juan Voluntario',
      role: 'VOLUNTEER',
      documentId: '12345678',
      tenantId: tenant.id,
    },
  });

  // 6. Votantes Simulados (50 Simpatizantes)
  console.log('👥 Creando 50 simpatizantes...');
  const firstNames = ['Carlos', 'Maria', 'Jose', 'Ana', 'Luis', 'Paula', 'Jorge', 'Diana', 'Pedro', 'Sofia'];
  const lastNames = ['Rodriguez', 'Gomez', 'Lopez', 'Garcia', 'Martinez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Diaz'];
  const tags = ['Líder Barrial', 'Indeciso', 'Voto Duro'];

  const puestos = await prisma.politicalDivision.findMany({
    where: { type: 'PUESTO' },
    take: 10,
  });

  for (let i = 0; i < 50; i++) {
    const firstName = firstNames[i % 10];
    const lastName = lastNames[Math.floor(i / 5) % 10];
    const cedula = (1000000000 + i).toString();
    const tag = tags[i % 3];

    await prisma.voter.create({
      data: {
        documentId: cedula,
        firstName,
        lastName,
        phone: `300${Math.floor(Math.random() * 9000000 + 1000000)}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
        tenantId: tenant.id,
        registrarId: volunteer.id,
        puestoId: puestos[i % 10].id,
        mesa: (i % 20) + 1,
        psychographicData: { tags: [tag] },
        votingIntention: Math.floor(Math.random() * 5) + 1,
        consentAccepted: true,
      },
    });
  }

  console.log('✅ Seed completado con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
