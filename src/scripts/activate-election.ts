import { prisma } from '@/lib/prisma';



async function main() {
  console.log('Iniciando protocolo de activación...');

  // 1. Ensure Campaign exists
  let campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
  if (!campaign) {
      const org = await prisma.organization.findFirst();
      if (!org) throw new Error('No organization found. Seed DB first.');
      
      campaign = await prisma.campaign.create({
          data: {
              name: 'Campaña 2026',
              status: 'active',
              organizationId: org.id
          }
      });
      console.log('Campaña creada.');
  }

  // 2. Manage Elections
  const electionName = "Alcaldía 2026";
  
  // Deactivate others
  await prisma.election.updateMany({
      where: { 
          name: { not: electionName },
          status: 'ACTIVE'
      },
      data: { status: 'CLOSED' }
  });

  // Activate Target
  const existing = await prisma.election.findFirst({ where: { name: electionName, campaignId: campaign.id } });
  
  if (existing) {
      await prisma.election.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE' }
      });
      console.log(`Elección existente '${electionName}' ACTIVADA.`);
  } else {
      await prisma.election.create({
          data: {
              name: electionName,
              electionDate: new Date('2026-10-25'),
              status: 'ACTIVE',
              campaignId: campaign.id
          }
      });
      console.log(`Elección '${electionName}' CREADA y ACTIVADA.`);
  }

  // 3. Audit
  // We need a system user ID or just 'system'
  await prisma.auditLog.create({
      data: {
          userId: 'system',
          action: 'SYSTEM_ACTIVATION',
          entity: 'Election',
          details: JSON.stringify({ msg: `SISTEMA: Elección ${electionName} activada para recepción de evidencia` })
      }
  });

  console.log('Protocolo finalizado.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

