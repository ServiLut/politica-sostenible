import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const whereClause = user.role === 'ADMIN' ? {} : { responsibleUserId: user.id };

  const expenses = await prisma.expense.findMany({
    where: whereClause,
    include: {
        event: { select: { name: true } },
        responsibleUser: { select: { fullName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return NextResponse.json(expenses);
}

