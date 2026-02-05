import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';



export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = user.role === 'ADMIN';
  const myTerritoryId = user.territoryId;

  // Filters
  const terrFilter = isAdmin ? {} : { id: myTerritoryId || 'NONE' };
  const contactFilter = isAdmin ? {} : { territoryId: myTerritoryId || 'NONE' };
  const expenseFilter = isAdmin ? {} : { responsibleUserId: user.id };

  try {
    // 1. General Stats
    const totalContacts = await prisma.politicalContact.count({ where: { status: 'active', ...contactFilter } });
    const totalVotes = totalContacts; // Projection
    const activeTerritories = await prisma.territory.count({ where: { politicalContacts: { some: {} }, ...terrFilter } });
    
    // Budget
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    const totalBudget = Number(org?.budget || 0);
    const expensesAgg = await prisma.expense.aggregate({ 
        _sum: { amount: true }, 
        where: expenseFilter 
    });
    const executedBudget = Number(expensesAgg._sum.amount || 0);

    // 2. Top Territories
    const territories = await prisma.territory.findMany({
        where: terrFilter,
        include: {
            _count: { select: { politicalContacts: true } }
        },
        orderBy: { politicalContacts: { _count: 'desc' } },
        take: 10
    });

    // 3. Recent Expenses
    const recentExpenses = await prisma.expense.findMany({
        where: expenseFilter,
        include: { event: { select: { name: true } }, responsibleUser: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    // 4. Team Performance (Users) - Only Admin mostly, or team in territory
    // Simplified: Top Recruiters
    // Prisma grouping by relation is tricky, use findMany on users
    const topRecruiters = await prisma.user.findMany({
        where: { isActive: true },
        select: {
            fullName: true,
            role: true,
            _count: { select: { politicalContacts: true } }
        },
        orderBy: { politicalContacts: { _count: 'desc' } },
        take: 5
    });

    return NextResponse.json({
        generatedAt: new Date(),
        user: { name: user.fullName, role: user.role },
        stats: {
            totalVotes,
            activeTerritories,
            totalBudget,
            executedBudget,
            budgetProgress: totalBudget > 0 ? (executedBudget / totalBudget) * 100 : 0
        },
        territories: territories.map(t => ({ name: t.name, count: t._count.politicalContacts, level: t.level })),
        expenses: recentExpenses.map(e => ({ 
            category: e.uxCategory, 
            amount: Number(e.amount), 
            date: e.createdAt, 
            user: e.responsibleUser.fullName 
        })),
        recruiters: topRecruiters.map(u => ({ name: u.fullName, role: u.role, count: u._count.politicalContacts }))
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Data fetch failed' }, { status: 500 });
  }
}

