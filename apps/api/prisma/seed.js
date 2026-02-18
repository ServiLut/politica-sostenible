const { PrismaClient } = require('../src/generated/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:dJOeUJhZ1x2mGpm7mHvh@76.13.101.140:5433/politica_sostenible'
    }
  }
});

async function main() {
  console.log('🚀 Iniciando carga geográfica de Colombia (JS Native)...');

  try {
    // 1. Crear Campaña Demo
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'campana-demo-2026' },
      update: {},
      create: {
        slug: 'campana-demo-2026',
        name: 'Campaña Democracia 2026',
        type: 'GSC',
      },
    });
    console.log(`✅ Campaña creada: ${tenant.name}`);

    // 2. Departamentos
    const departamentos = [
      { code: '05', name: 'ANTIOQUIA' },
      { code: '08', name: 'ATLÁNTICO' },
      { code: '11', name: 'BOGOTÁ, D.C.' },
      { code: '13', name: 'BOLÍVAR' },
      { code: '76', name: 'VALLE DEL CAUCA' },
    ];

    for (const dep of departamentos) {
      await prisma.politicalDivision.upsert({
        where: { code_type: { code: dep.code, type: 'DEPARTAMENTO' } },
        update: {},
        create: {
          code: dep.code,
          name: dep.name,
          type: 'DEPARTAMENTO',
        },
      });
    }
    console.log('✅ Departamentos cargados.');

    // 3. Municipios
    const municipios = [
      { code: '05001', name: 'MEDELLÍN', parentCode: '05' },
      { code: '08001', name: 'BARRANQUILLA', parentCode: '08' },
      { code: '11001', name: 'BOGOTÁ', parentCode: '11' },
      { code: '76001', name: 'CALI', parentCode: '76' },
    ];

    for (const mun of municipios) {
      const parent = await prisma.politicalDivision.findUnique({
        where: { code_type: { code: mun.parentCode, type: 'DEPARTAMENTO' } },
      });

      if (parent) {
        await prisma.politicalDivision.upsert({
          where: { code_type: { code: mun.code, type: 'MUNICIPIO' } },
          update: {},
          create: {
            code: mun.code,
            name: mun.name,
            type: 'MUNICIPIO',
            parentId: parent.id,
          },
        });
      }
    }
    console.log('✅ Municipios cargados.');

    console.log('🎉 Seed finalizado con éxito.');
  } catch (error) {
    console.error('❌ Error en el seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
