import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PqrsdDossierStatus,
  PqrsdRiskLevel,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { CasesService } from '../cases/cases.service';
import { PQRSD_READ_ROLES } from '../pqrsd/pqrsd-access.constants';

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
const CASE_SEARCH_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
};

interface SearchVoter {
  id: string;
  firstName: string;
  lastName: string;
}

interface SearchCaseResult {
  items: Array<{
    id: string;
    title: string;
    reference: string;
    status: string;
  }>;
}

interface SearchPqrsd {
  id: string;
  reference: string;
  subject: string;
  status: PqrsdDossierStatus;
  riskLevel: PqrsdRiskLevel;
  currentPrimaryAssignee: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  currentBackupAssignee: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  deadlines: Array<{ dueAt: Date | null }>;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly commitments: CommitmentsService,
    private readonly cases: CasesService,
  ) {}

  async globalSearch(user: AuthenticatedUser, query: string) {
    const searchQuery = query.trim();
    if (searchQuery.length < 3) {
      return {
        voters: [],
        users: [],
        proposals: [],
        tasks: [],
        commitments: [],
        cases: [],
        incidents: [],
        pqrsd: [],
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
    const canSearchPqrsd =
      tenant.type === TenantType.PUBLIC_OFFICE &&
      PQRSD_READ_ROLES.includes(access.role);

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
    const pqrsdPromise: Promise<SearchPqrsd[]> = canSearchPqrsd
      ? this.prisma.pqrsdDossier.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { reference: { contains: searchQuery, mode: 'insensitive' } },
              { subject: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            reference: true,
            subject: true,
            status: true,
            riskLevel: true,
            currentPrimaryAssignee: {
              select: { id: true, name: true, isActive: true },
            },
            currentBackupAssignee: {
              select: { id: true, name: true, isActive: true },
            },
            deadlines: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: { dueAt: true },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 5,
        })
      : Promise.resolve([]);

    const canSearchCases = CASE_SEARCH_ROLES[tenant.defaultMode].includes(
      access.role,
    );
    const casesPromise: Promise<SearchCaseResult> = canSearchCases
      ? this.cases.findAll(user, {
          page: 1,
          limit: 5,
          search: searchQuery,
        })
      : Promise.resolve({ items: [] });

    const [
      voters,
      users,
      proposals,
      pqrsdDossiers,
      taskResult,
      commitmentResult,
      caseResult,
    ] = await Promise.all([
      votersPromise,
      usersPromise,
      proposalsPromise,
      pqrsdPromise,
      this.tasks.findAll(user, {
        page: 1,
        limit: 5,
        search: searchQuery,
      }),
      this.commitments.findAll(user, {
        page: 1,
        limit: 5,
        search: searchQuery,
      }),
      casesPromise,
    ]);

    const formattedVoters = voters.map((v) => ({
      id: v.id,
      name: `${v.firstName} ${v.lastName}`.trim(),
    }));
    const formattedCases = caseResult.items.map((issueCase) => ({
      id: issueCase.id,
      title: issueCase.title,
      reference: issueCase.reference,
      status: issueCase.status,
    }));
    const formattedPqrsd = pqrsdDossiers.map((dossier) => {
      const responsible = dossier.currentPrimaryAssignee?.isActive
        ? dossier.currentPrimaryAssignee
        : dossier.currentBackupAssignee?.isActive
          ? dossier.currentBackupAssignee
          : null;
      return {
        id: dossier.id,
        reference: dossier.reference,
        subject: dossier.subject,
        status: dossier.status,
        riskLevel: dossier.riskLevel,
        dueAt: dossier.deadlines[0]?.dueAt?.toISOString() ?? null,
        responsible: responsible
          ? { id: responsible.id, name: responsible.name }
          : null,
      };
    });

    return {
      voters: formattedVoters,
      users,
      proposals,
      tasks: taskResult.items.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
      })),
      commitments: commitmentResult.items.map((commitment) => ({
        id: commitment.id,
        title: commitment.title,
        reference: commitment.reference,
        status: commitment.status,
      })),
      cases:
        tenant.defaultMode === PoliticalOperationMode.PUBLIC_OFFICE
          ? formattedCases
          : [],
      incidents:
        tenant.defaultMode === PoliticalOperationMode.CAMPAIGN
          ? formattedCases
          : [],
      pqrsd: formattedPqrsd,
    };
  }
}
