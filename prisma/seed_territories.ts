import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🌍 Seeding Territories...');

  const campaign = await prisma.campaign.findFirst();
  if (!campaign) {
    console.error('❌ No active campaign found. Run seed.ts first.');
    return;
  }

  // Comunas de Medellín (Ejemplo)
  const comunas = [
    { name: 'Comuna 13 - San Javier', lat: 6.2552, lng: -75.6075 },
    { name: 'Comuna 14 - El Poblado', lat: 6.2115, lng: -75.5714 },
    { name: 'Comuna 16 - Belén', lat: 6.2289, lng: -75.6022 },
    { name: 'Comuna 7 - Robledo', lat: 6.2798, lng: -75.5960 },
  ];

  for (const c of comunas) {
    await prisma.territory.create({
      data: {
        name: c.name,
        level: 'comuna',
        campaignId: campaign.id,
        lat: c.lat,
        lng: c.lng
      }
    });
  }

  console.log('✅ Territories created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
