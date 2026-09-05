import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(tenantId: string, query: string) {
    if (!query || query.length < 3) {
      return {
        voters: [],
        users: [],
        proposals: [],
        documents: [],
      };
    }

    const searchQuery = query;

    const [voters, users, proposals, documents] = await Promise.all([
      this.prisma.voter.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: searchQuery, mode: 'insensitive' } },
            { lastName: { contains: searchQuery, mode: 'insensitive' } },
            { documentId: { contains: searchQuery, mode: 'insensitive' } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, documentId: true },
        take: 5,
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchQuery, mode: 'insensitive' } },
            { email: { contains: searchQuery, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 5,
      }),
      this.prisma.politicalProposal.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: searchQuery, mode: 'insensitive' } },
            { referenceCode: { contains: searchQuery, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, referenceCode: true },
        take: 5,
      }),
      this.prisma.storedObject.findMany({
        where: {
          tenantId,
          OR: [
            { path: { contains: searchQuery, mode: 'insensitive' } },
            { contentType: { contains: searchQuery, mode: 'insensitive' } },
          ],
        },
        select: { id: true, path: true, module: true },
        take: 5,
      }),
    ]);

    const formattedVoters = voters.map((v) => ({
      id: v.id,
      name: `${v.firstName} ${v.lastName}`.trim(),
      documentId: v.documentId,
    }));

    return {
      voters: formattedVoters,
      users,
      proposals,
      documents,
    };
  }
}
