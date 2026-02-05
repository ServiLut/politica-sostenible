import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



// Helper to ensure Campaign Context exists (Self-Healing)
async function ensureCampaign() {
    let campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
    if (!campaign) {
        // Check/Create Organization
        let org = await prisma.organization.findFirst();
        if (!org) {
            org = await prisma.organization.create({
                data: { name: 'Organización Política', budget: 0 }
            });
        }
        // Create Default Campaign
        campaign = await prisma.campaign.create({
            data: {
                name: 'Campaña 2026',
                status: 'active',
                organizationId: org.id
            }
        });
    }
    return campaign;
}

export async function GET(req: NextRequest) {
  try {
    // 1. Ensure Active Campaign (Self-Healing)
    const activeCampaign = await ensureCampaign();

    // 2. Fetch Events
    const events = await prisma.event.findMany({
        where: { 
            campaignId: activeCampaign.id 
        },
        select: { id: true, name: true, eventDate: true },
        orderBy: { eventDate: 'desc' },
        take: 50
    });
    
    return NextResponse.json(events);
  } catch (e) {
      console.error(e);
      return NextResponse.json({ error: 'Error fetching events' }, { status: 500 });
  }
}

