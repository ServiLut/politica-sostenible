import { prisma } from './src/lib/prisma';

async function main() {
  console.log('🔍 INSPECTING CONTACTS');
  const contacts = await prisma.politicalContact.findMany({
      include: {
          person: true
      }
  });
  console.table(contacts.map(c => ({ 
      id: c.id, 
      person: c.person.fullName, 
      status: c.status, 
      owner: c.ownerLeaderId,
      territory: c.territoryId 
  })));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
