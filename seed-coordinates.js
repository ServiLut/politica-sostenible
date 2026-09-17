const { PrismaClient } = require('./apps/api/prisma/generated/prisma');
const prisma = new PrismaClient();
async function run() {
  const divisions = await prisma.politicalDivision.findMany();
  let updated = 0;
  for (const div of divisions) {
    const lat = 4.0 + Math.random() * 6.0;
    const lon = -74.0 + Math.random() * 2.0;
    await prisma.politicalDivision.update({
      where: { id: div.id },
      data: { latitude: lat, longitude: lon }
    });
    updated++;
  }
  const catalogs = await prisma.electoralCatalogEntry.findMany();
  for (const cat of catalogs) {
    const lat = 4.0 + Math.random() * 6.0;
    const lon = -74.0 + Math.random() * 2.0;
    await prisma.electoralCatalogEntry.update({
      where: { id: cat.id },
      data: { latitude: lat, longitude: lon }
    });
    updated++;
  }
  console.log('Coordinates seeded! Updated ' + updated + ' records.');
}
run().catch(console.error).finally(() => prisma.$disconnect());
