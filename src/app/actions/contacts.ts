'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';



export async function getContacts({ 
    page = 1, 
    limit = 20, 
    query = '', 
    territoryId = '', 
    leaderId = '', 
    voted = '' 
}: { 
    page?: number; 
    limit?: number; 
    query?: string; 
    territoryId?: string; 
    leaderId?: string; 
    voted?: string;
}) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Unauthorized');

        const skip = (page - 1) * limit;

        // Base Role Filter
        let roleFilter: any = {};
        if (user.role === 'ADMIN') {
            // No restriction
        } else if (user.role === 'COORDINATOR') {
            roleFilter.territoryId = user.territoryId || 'NONE';
        } else if (user.role === 'LEADER') {
            roleFilter.ownerLeaderId = user.id;
        } else {
            roleFilter.id = 'nothing'; // Block others
        }

        // Dynamic Filters
        const dynamicFilters: any[] = [];
        if (territoryId) dynamicFilters.push({ territoryId });
        if (leaderId) dynamicFilters.push({ ownerLeaderId: leaderId });
        
        // Voted Status Filter
        let electoralFilter = {};
        if (voted) {
            const isVoted = voted === 'true';
            electoralFilter = {
                electoralHistory: {
                    some: {
                       voted: isVoted
                    }
                }
            };
        }

        // Search Filter
        const searchFilter = query ? {
            OR: [
              { person: { fullName: { contains: query, mode: 'insensitive' } } },
              { person: { phone: { contains: query } } }
            ]
        } : {};

        const whereClause = {
            AND: [
                roleFilter,
                ...dynamicFilters,
                electoralFilter,
                searchFilter
            ]
        };

        const [contacts, totalCount] = await Promise.all([
            prisma.politicalContact.findMany({
                where: whereClause as any,
                include: {
                    person: true,
                    territory: true, // Inclusión forzada del territorio
                    leader: {
                        select: { fullName: true }
                    },
                    electoralHistory: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: { voted: true, transportNeed: true }
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.politicalContact.count({ where: whereClause as any })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        // Flatten for UI
        const flatContacts = contacts.map(c => ({
            id: c.id,
            fullName: c.person.fullName || 'Sin Nombre',
            phone: c.person.phone,
            leader: c.leader?.fullName || 'N/A',
            territoryId: c.territoryId,
            territoryName: c.territory?.name || 'Sin Zona',
            status: c.status,
            voted: c.electoralHistory[0]?.voted || false,
            transportNeed: c.electoralHistory[0]?.transportNeed || 'N/A',
            lastContacted: c.lastContacted,
            createdAt: c.createdAt
        }));

        return { contacts: flatContacts, totalPages, totalCount };

    } catch (error) {
        console.error('Get Contacts Error:', error);
        return { contacts: [], totalPages: 0, totalCount: 0 };
    }
}
