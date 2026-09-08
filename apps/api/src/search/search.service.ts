import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';

const VOTER_SEARCH_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
] as const;

const PROPOSAL_SEARCH_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const TERRITORIALLY_SCOPED_ROLES = [Role.ZONE_COORDINATOR] as const;
const SEARCH_ROLES = Object.values(Role);

interface SearchVoter {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SearchUser {
  id: string;
  name: string;
  email: string;
}

export interface SearchProposal {
  id: string;
  title: string;
  referenceCode: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(user: AuthenticatedUser, query: string) {
    const searchQuery = query.trim();
    if (searchQuery.length < 3) {
      return {
        voters: [],
        users: [],
        proposals: [],
        documents: [],
      };
    }

    const [tenant, access] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { defaultMode: true, type: true },
      }),
      resolveTerritorialAccess({
        client: this.prisma,
        tenantId: user.tenantId,
        userId: user.userId,
        allowedRoles: SEARCH_ROLES,
        territoriallyScopedRoles: TERRITORIALLY_SCOPED_ROLES,
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    const canSearchVoters =
      tenant.defaultMode === PoliticalOperationMode.CAMPAIGN &&
      VOTER_SEARCH_ROLES.includes(
        access.role as (typeof VOTER_SEARCH_ROLES)[number],
      );
    const canSearchUsers = access.role === Role.ADMIN;
    const canSearchProposals =
      tenant.defaultMode === PoliticalOperationMode.CAMPAIGN &&
      (tenant.type === TenantType.CANDIDACY ||
        tenant.type === TenantType.PARTY) &&
      PROPOSAL_SEARCH_ROLES.includes(
        access.role as (typeof PROPOSAL_SEARCH_ROLES)[number],
      );

    const votersPromise: Promise<SearchVoter[]> = canSearchVoters
      ? this.prisma.voter.findMany({
          where: {
            tenantId: user.tenantId,
            ...(access.divisionIds
              ? { puestoId: { in: access.divisionIds } }
              : {}),
            OR: [
              { firstName: { contains: searchQuery, mode: 'insensitive' } },
              { lastName: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
          take: 5,
        })
      : Promise.resolve([]);
    const usersPromise: Promise<SearchUser[]> = canSearchUsers
      ? this.prisma.user.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            OR: [
              { name: { contains: searchQuery, mode: 'insensitive' } },
              { email: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, email: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 5,
        })
      : Promise.resolve([]);
    const proposalsPromise: Promise<SearchProposal[]> = canSearchProposals
      ? this.prisma.politicalProposal.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { title: { contains: searchQuery, mode: 'insensitive' } },
              {
                referenceCode: {
                  contains: searchQuery,
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { id: true, title: true, referenceCode: true },
          orderBy: [{ title: 'asc' }, { id: 'asc' }],
          take: 5,
        })
      : Promise.resolve([]);

    const [voters, users, proposals] = await Promise.all([
      votersPromise,
      usersPromise,
      proposalsPromise,
    ]);

    const formattedVoters = voters.map((v) => ({
      id: v.id,
      name: `${v.firstName} ${v.lastName}`.trim(),
    }));

    return {
      voters: formattedVoters,
      users,
      proposals,
      documents: [],
    };
  }
}
