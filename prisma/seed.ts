import { ElectionStatus, ActorRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🌱 Starting Política Sostenible Data Seed...');

  // 1. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Campaña Presidencial 2026',
      legalId: 'NIT-900123456', // Example
      responsibleName: 'Comité Central',
    },
  });
  console.log(`✅ Organization created: ${org.name} (${org.id})`);

  // 2. Create Active Campaign
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Victoria 2026 - Primera Vuelta',
      status: 'active',
      organizationId: org.id,
    },
  });
  console.log(`✅ Campaign created: ${campaign.name} (${campaign.id})`);

  // 3. Create Draft Election
  // Fecha simulada para el futuro
  const electionDate = new Date();
  electionDate.setMonth(electionDate.getMonth() + 6);

  const election = await prisma.election.create({
    data: {
      name: 'Elección General',
      electionDate: electionDate,
      status: ElectionStatus.DRAFT,
      campaignId: campaign.id,
    },
  });
  console.log(`✅ Election created: ${election.name} (${election.id})`);

  // 4. Create Admin User
  const pin = '1234';
  const pinHash = await hash(pin, 10);

  const admin = await prisma.user.create({
    data: {
      fullName: 'Administrador de Sistemas',
      role: ActorRole.ADMIN,
      pinHash: pinHash,
      isActive: true,
      organizationId: org.id,
      // Note: Admin might not act as a specific "role" in a territory yet, 
      // but they are linked to the Org.
    },
  });
  console.log(`✅ Admin User created: ${admin.fullName} (${admin.id})`);
  console.log(`🔑 Admin PIN set to: ${pin}`);

  console.log('🚀 Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
