import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { compare } from 'bcryptjs';
import { ensureElectionIsOpen } from '@/lib/guards';



// Helper to ensure Campaign Context exists (Self-Healing)
async function ensureCampaign() {
    let campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
    if (!campaign) {
        let org = await prisma.organization.findFirst();
        if (!org) {
            org = await prisma.organization.create({
                data: { name: 'Organización Política', budget: 0 }
            });
        }
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

export async function POST(req: NextRequest) {
  try {
    await ensureElectionIsOpen();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, category, eventId, description, pin, createAdministrativeEvent, evidencePhotoUrl, newEventName } = await req.json();
    const amountVal = parseFloat(amount);

    // 1. PIN Logic for High Amounts
    if (amountVal > 50000) {
        if (!pin) {
            return NextResponse.json({ error: 'Se requiere PIN para gastos mayores a $50,000' }, { status: 400 });
        }
        
        const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!secureUser || !secureUser.pinHash) {
             return NextResponse.json({ error: 'Error de configuración de seguridad' }, { status: 403 });
        }
        const valid = await compare(pin, secureUser.pinHash);
        if (!valid) {
            return NextResponse.json({ error: 'PIN de autorización inválido' }, { status: 403 });
        }
    }

    // 2. Event Handling
    let targetEventId = eventId;

    if (newEventName || createAdministrativeEvent) {
        const todayStr = new Date().toISOString().split('T')[0];
        const finalName = newEventName || `Gasto Administrativo - ${todayStr}`;
        
        // Ensure Campaign
        const campaign = await ensureCampaign();

        // Check duplicates only if not strictly "Administrative" auto-generated, or just create new if explicit name
        // Ideally we check if it exists to reuse, but for "New Event" usually implies create.
        // Let's reuse if same name exists to avoid clutter.
        const existingEvent = await prisma.event.findFirst({
            where: { name: finalName, campaignId: campaign.id }
        });

        if (existingEvent) {
            targetEventId = existingEvent.id;
        } else {
            // Fallback territory
            let territoryId = user.territoryId;
            if (!territoryId) {
                const globalTerr = await prisma.territory.findFirst();
                territoryId = globalTerr?.id;
            }
            
            // If absolutely no territory exists, create a default "Sede Central"
            if (!territoryId) {
                const newTerr = await prisma.territory.create({
                    data: { name: 'Sede Central', level: 'zona', campaignId: campaign.id }
                });
                territoryId = newTerr.id;
            }

            const newEvent = await prisma.event.create({
                data: {
                    name: finalName,
                    eventDate: new Date(),
                    campaignId: campaign.id,
                    territoryId: territoryId,
                    responsibleUserId: user.id
                }
            });
            targetEventId = newEvent.id;
        }
    }

    if (!targetEventId) {
        return NextResponse.json({ error: 'Evento requerido. Selecciona uno o crea uno nuevo.' }, { status: 400 });
    }

    // 3. Create Expense
    const expense = await prisma.expense.create({
      data: {
        amount: amountVal,
        type: amountVal > 50000 ? 'formal' : 'micro',
        uxCategory: category,
        eventId: targetEventId,
        responsibleUserId: user.id,
        evidencePhotoUrl: evidencePhotoUrl || null,
        cneCategoryId: mapUxToCne(category)
      }
    });

    // 4. Security Audit Log
    await prisma.auditLog.create({
        data: {
            action: 'FINANCE_UPLOAD',
            userId: user.id,
            entity: 'FINANCE',
            entityId: expense.id,
            details: {
                amount: amountVal,
                category: category,
                eventId: targetEventId,
                expenseId: expense.id
            }
        }
    });

    return NextResponse.json({ success: true, expense });

  } catch (error: any) {
    console.error('Create Expense Error:', error);
    return NextResponse.json({ error: error.message || 'Error creating expense' }, { status: 500 });
  }
}

function mapUxToCne(uxCat: string) {
    const map: any = {
        'Transporte': 'CNE-001-TRANSPORTE',
        'Refrigerios': 'CNE-002-ALIMENTACION',
        'Publicidad': 'CNE-003-PROPAGANDA',
        'Logistica': 'CNE-004-ACTOS-PUBLICOS',
        'Otros': 'CNE-099-VARIOS'
    };
    return map[uxCat] || 'CNE-099-VARIOS';
}

