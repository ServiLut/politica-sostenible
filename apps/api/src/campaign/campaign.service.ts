import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import {
  DANE_DIVIPOLA_SOURCE,
  DaneDivipolaClient,
  type DaneMunicipality,
} from './dane-divipola.client';
import { ListDivisionsQueryDto } from './dto/list-divisions-query.dto';
import {
  CreatePoliticalDivisionDto,
  CreatableDivisionType,
} from './dto/create-political-division.dto';

interface Department {
  code: string;
  name: string;
}

const CAMPAIGN_VIEW_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  defaultMode: true,
} satisfies Prisma.TenantSelect;

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly daneDivipolaClient: DaneDivipolaClient,
  ) {}

  /**
   * Sincroniza la geografía electoral de la campaña autenticada con DANE
   * DIVIPOLA MGN 2025. La descarga se completa y valida antes de escribir en
   * PostgreSQL; la operación sólo hace upsert y nunca elimina divisiones.
   */
  async initializeElectoralData(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_VIEW_SELECT,
    });

    if (!tenant) {
      throw new NotFoundException('Campaña no encontrada');
    }
    assertCampaignTenant(tenant);

    let municipalities: DaneMunicipality[];
    try {
      municipalities = await this.daneDivipolaClient.fetchMunicipalities();
    } catch (error) {
      this.logger.error(
        'No se pudo obtener o validar DIVIPOLA MGN 2025',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'No fue posible sincronizar con DANE; no se realizaron cambios',
      );
    }

    const departments = this.collectDepartments(municipalities);

    try {
      const departmentIds = new Map<string, string>();

      for (const department of departments) {
        const saved = await this.prisma.politicalDivision.upsert({
          where: {
            tenantId_code_type: {
              tenantId,
              code: department.code,
              type: DivisionType.DEPARTAMENTO,
            },
          },
          update: { name: department.name },
          create: {
            tenantId,
            code: department.code,
            name: department.name,
            type: DivisionType.DEPARTAMENTO,
          },
          select: { id: true },
        });
        departmentIds.set(department.code, saved.id);
      }

      for (const municipality of municipalities) {
        const parentId = departmentIds.get(municipality.departmentCode);
        if (!parentId) {
          throw new Error(
            `No se creó el departamento ${municipality.departmentCode}`,
          );
        }

        await this.prisma.politicalDivision.upsert({
          where: {
            tenantId_code_type: {
              tenantId,
              code: municipality.municipalityCode,
              type: DivisionType.MUNICIPIO,
            },
          },
          update: {
            name: municipality.municipalityName,
            parentId,
          },
          create: {
            tenantId,
            code: municipality.municipalityCode,
            name: municipality.municipalityName,
            type: DivisionType.MUNICIPIO,
            parentId,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Falló la persistencia DIVIPOLA para tenant ${tenantId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'La sincronización territorial no pudo completarse',
      );
    }

    return {
      message: 'Geografía electoral sincronizada correctamente desde DANE',
      tenant,
      source: DANE_DIVIPOLA_SOURCE,
      synchronized: {
        departments: departments.length,
        municipalities: municipalities.length,
      },
      synchronizedAt: new Date().toISOString(),
    };
  }

  async getCampaign(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_VIEW_SELECT,
    });

    if (!tenant) {
      throw new NotFoundException('Campaña no encontrada');
    }
    assertCampaignTenant(tenant);

    return tenant;
  }

  async createDivision(
    user: AuthenticatedUser,
    dto: CreatePoliticalDivisionDto,
  ) {
    const allowedParentTypes =
      dto.type === CreatableDivisionType.ZONA
        ? [DivisionType.MUNICIPIO]
        : [DivisionType.MUNICIPIO, DivisionType.ZONA];

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [tenant, admin, parent] = await Promise.all([
            tx.tenant.findUnique({
              where: { id: user.tenantId },
              select: CAMPAIGN_TENANT_SELECT,
            }),
            tx.user.findFirst({
              where: {
                id: user.userId,
                tenantId: user.tenantId,
                role: Role.ADMIN,
                isActive: true,
              },
              select: { id: true },
            }),
            tx.politicalDivision.findFirst({
              where: {
                id: dto.parentId,
                tenantId: user.tenantId,
                type: { in: allowedParentTypes },
              },
              select: { id: true, type: true },
            }),
          ]);
          assertCampaignTenant(tenant);

          if (!admin) {
            throw new ForbiddenException(
              'La cuenta ya no puede administrar el territorio',
            );
          }
          if (!parent) {
            throw new BadRequestException(
              'El territorio padre no pertenece al tenant o no es compatible',
            );
          }

          const division = await tx.politicalDivision.create({
            data: {
              tenantId: user.tenantId,
              type: dto.type,
              code: dto.code.trim().toUpperCase(),
              name: dto.name.trim(),
              parentId: parent.id,
            },
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              parentId: true,
              parent: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'POLITICAL_DIVISION_CREATED',
              resourceType: 'PoliticalDivision',
              resourceId: division.id,
              after: {
                type: division.type,
                code: division.code,
                parentId: division.parentId,
              },
            },
          });

          return division;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException(
          error.code === 'P2002'
            ? 'Ya existe una división con ese código y tipo'
            : 'El territorio cambió durante la solicitud; vuelve a intentarlo',
        );
      }
      throw error;
    }
  }

  async findDivisions(tenantId: string, query: ListDivisionsQueryDto) {
    await this.assertCampaignMode(tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.PoliticalDivisionWhereInput = {
      tenantId,
      type: query.type,
      ...(query.search
        ? {
            OR: [
              {
                code: { contains: query.search, mode: 'insensitive' },
              },
              {
                name: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.politicalDivision.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          parentId: true,
          parent: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.politicalDivision.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }

  private collectDepartments(municipalities: DaneMunicipality[]): Department[] {
    const departments = new Map<string, Department>();

    for (const municipality of municipalities) {
      departments.set(municipality.departmentCode, {
        code: municipality.departmentCode,
        name: municipality.departmentName,
      });
    }

    return [...departments.values()].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }
}
