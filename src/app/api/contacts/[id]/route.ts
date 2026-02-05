import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';



export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contactId = params.id;

  const contact = await prisma.politicalContact.findUnique({
    where: { id: contactId },
    include: {
        person: { include: { pollingPlace: true } },
        leader: { select: { fullName: true } },
        territory: { select: { name: true } },
        electoralHistory: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
                pollingPlace: true,
                pollingTable: true
            }
        }
    }
  });

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Security Filter: Leader only sees own contacts (already checked in search, but double check here)
  if (user.role === 'LEADER' && contact.ownerLeaderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch Audit Logs
  const logs = await prisma.auditLog.findMany({
      where: {
          OR: [
              { entity: 'Person', entityId: contact.person.id },
              { entity: 'PoliticalContact', entityId: contact.id }
          ]
      },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10
  });

  // AUDIT LOG: View Sensitive Data
  const { createAuditLog } = await import('@/lib/audit');
  await createAuditLog(user.id, 'VIEW_PROFILE', 'Person', contact.person.id, { 
      targetName: contact.person.fullName,
      role: user.role 
  });

  // Flatten transportNeed for easier UI consumption
  const transportNeed = contact.person.transportNeed || (contact.electoralHistory[0]?.transportNeed === 'transport');

  // Mask sensitive data for non-admins
  if (user.role !== 'ADMIN') {
      // Hide actual URL, just say "uploaded"
      if (contact.person.idCardFrontUrl) contact.person.idCardFrontUrl = 'PROTECTED';
      if (contact.person.idCardBackUrl) contact.person.idCardBackUrl = 'PROTECTED';
  }

  return NextResponse.json({ ...contact, transportNeed, logs });
}
