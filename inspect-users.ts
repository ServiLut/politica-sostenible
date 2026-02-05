import { prisma } from './src/lib/prisma';

async function main() {
  console.log('🔍 INSPECTING USERS (via Singleton)');
  try {
    const users = await prisma.user.findMany();
    console.table(users.map(u => ({ id: u.id, name: u.fullName, role: u.role })));
  } catch (error) {
    console.error('Error fetching users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();