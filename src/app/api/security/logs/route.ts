import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20; // Updated to 20 per request
    const actionFilter = searchParams.get('action');

    const where: any = {};
    if (actionFilter) {
        where.action = actionFilter;
    }

    const logs = await prisma.auditLog.findMany({
        where,
        include: { user: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit
    });

    const total = await prisma.auditLog.count({ where });

    return NextResponse.json({
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Logs Error:', error);
    // Audit System Error (Self-logging if possible, or console)
    return NextResponse.json({ error: 'Error fetching logs' }, { status: 500 });
  }
}
