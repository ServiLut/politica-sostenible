import { prisma } from './src/lib/prisma';

async function main() {
  console.log('🔍 DEBUGGING DATA COUNTS');
  
  const contacts = await prisma.politicalContact.count();
  const contactsActive = await prisma.politicalContact.count({ where: { status: 'active' } });
  
  const territories = await prisma.territory.count();
  const territoriesWithContacts = await prisma.territory.count({
    where: { politicalContacts: { some: {} } }
  });

  const expenses = await prisma.expense.count();
  const expensesSum = await prisma.expense.aggregate({ _sum: { amount: true } });

  console.log({
    totalContacts: contacts,
    activeContacts: contactsActive,
    totalTerritories: territories,
    activeTerritories: territoriesWithContacts,
    totalExpenses: expenses,
    expensesAmount: expensesSum._sum.amount
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
