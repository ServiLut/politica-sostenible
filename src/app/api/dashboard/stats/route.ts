import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';



export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user.role;
    const myTerritoryId = user.territoryId;

    // --- TUNNEL VISION LOGIC ---
    let whereClause: any = { status: 'active' }; // Base filter for Contacts

    if (role === 'ADMIN') {
        // Full Access
    } else if (role === 'COORDINATOR') {
        // Coordinator sees EVERYTHING in their responsible territory
        whereClause.territoryId = myTerritoryId || 'NONE';
    } else if (role === 'LEADER') {
        // Leader sees only their OWN contacts
        whereClause.ownerLeaderId = user.id;
    } else {
        // Default restricted
        whereClause.ownerLeaderId = user.id;
    }

    // Logistics Filter (Inherits Tunnel Vision)
    // We want to count people needing transport within the allowed scope.
    
    const [totalContacts, activeAnomalies, org, expensesExecuted, expensesPending, coverage, transportNeeds] = await Promise.all([
        // 1. VOTES (Contacts)
        prisma.politicalContact.count({ where: whereClause }),
        
        // 2. ANOMALIES
        prisma.anomalyAlert.count({
            where: { 
                status: 'OPEN',
                ...(role === 'ADMIN' ? {} : { territoryId: myTerritoryId || 'NONE' })
            }
        }),

        // 3. BUDGET CONTEXT
        prisma.organization.findUnique({
            where: { id: user.organizationId },
            select: { budget: true }
        }),

        // 4. GASTOS EJECUTADOS (COMPLETED)
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                ...(role === 'ADMIN' ? {} : { responsibleUserId: user.id }),
                status: 'COMPLETED'
            }
        }),

        // 5. GASTOS PENDIENTES (PROCESANDO)
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                ...(role === 'ADMIN' ? {} : { responsibleUserId: user.id }),
                status: 'PROCESANDO'
            }
        }),

        // 6. COVERAGE (Zones with contacts)
        prisma.territory.count({
            where: {
                politicalContacts: { some: whereClause }
            }
        }),

        // 7. LOGISTICS (Transport Needs)
        prisma.electoralContact.count({
            where: {
                politicalContact: whereClause, // Apply Scope
                transportNeed: 'transport'
            }
        })
    ]);

    // AUDIT VIEW
    const { createAuditLog } = await import('@/lib/audit');
    createAuditLog(user.id, 'VIEW_DASHBOARD', 'Dashboard', 'Executive', { role: user.role }).catch(console.error);

    const TOTAL_BUDGET = Number(org?.budget || 0);
    const spentExecuted = Number(expensesExecuted._sum.amount || 0);
    const pending = Number(expensesPending._sum.amount || 0);
    
    // FIX: Sumar gastos pendientes al total ejecutado para reflejar el compromiso presupuestal real
    const totalSpent = spentExecuted + pending;
    
    const budgetDisplay = role === 'ADMIN' ? `${totalSpent} / ${TOTAL_BUDGET}` : totalSpent;

    return NextResponse.json({
      votes: totalContacts,
      anomalies: activeAnomalies,
      budget: budgetDisplay,
      budgetPending: pending, // Keep for detailed view
      coverage: coverage,
      transport: transportNeeds 
    });
  } catch (error) {
    console.error('KPI Error:', error);
    return NextResponse.json({ error: 'Error fetching KPIs' }, { status: 500 });
  }
}

