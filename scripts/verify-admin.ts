import { prisma } from '@/lib/prisma';
import { ActorRole } from '@prisma/client';

async function main() {
  console.log('🔍 Verifying User Roles...');

  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, role: true, isActive: true }
  });

  console.table(users);

  const adminName = 'Administrador de Sistemas';
  const adminUser = users.find(u => u.fullName === adminName);

  if (adminUser) {
    if (adminUser.role !== ActorRole.ADMIN) {
        console.log(`⚠️ User '${adminName}' is NOT ADMIN (Current: ${adminUser.role}). Fixing...`);
        await prisma.user.update({
            where: { id: adminUser.id },
            data: { role: ActorRole.ADMIN }
        });
        console.log(`✅ User '${adminName}' promoted to ADMIN.`);
    } else {
        console.log(`✅ User '${adminName}' is already ADMIN.`);
    }
  } else {
      console.log(`❌ User '${adminName}' not found. You might be logged in as someone else.`);
  }

  // Check if there are NO admins
  const admins = users.filter(u => u.role === ActorRole.ADMIN);
  if (admins.length === 0) {
      console.warn('⚠️ WARNING: No ADMIN users found in the database!');
      if (users.length > 0) {
          console.log(`🔧 Promoting first user '${users[0].fullName}' to ADMIN...`);
          await prisma.user.update({
              where: { id: users[0].id },
              data: { role: ActorRole.ADMIN }
          });
          console.log('✅ Promoted.');
      }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
