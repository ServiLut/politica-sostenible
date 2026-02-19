import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampaignService {
  constructor(private prisma: PrismaService) {}

  /**
   * Inicializa la geografía electoral de Colombia y crea una campaña demo.
   */
  async initializeElectoralData() {
    try {
      // 1. Crear Campaña Demo
      const tenant = await this.prisma.tenant.upsert({
        where: { slug: 'campana-demo-2026' },
        update: {},
        create: {
          slug: 'campana-demo-2026',
          name: 'Campaña Democracia 2026',
          type: 'GSC',
        },
      });

      // 2. Departamentos
      const departamentos = [
        { code: '05', name: 'ANTIOQUIA' },
        { code: '08', name: 'ATLÁNTICO' },
        { code: '11', name: 'BOGOTÁ, D.C.' },
        { code: '13', name: 'BOLÍVAR' },
        { code: '76', name: 'VALLE DEL CAUCA' },
      ];

      for (const dep of departamentos) {
        await this.prisma.politicalDivision.upsert({
          where: { code_type: { code: dep.code, type: 'DEPARTAMENTO' } },
          update: {},
          create: {
            code: dep.code,
            name: dep.name,
            type: 'DEPARTAMENTO',
          },
        });
      }

      // 3. Municipios
      const municipios = [
        { code: '05001', name: 'MEDELLÍN', parentCode: '05' },
        { code: '08001', name: 'BARRANQUILLA', parentCode: '08' },
        { code: '11001', name: 'BOGOTÁ', parentCode: '11' },
        { code: '76001', name: 'CALI', parentCode: '76' },
      ];

      for (const mun of municipios) {
        const parent = await this.prisma.politicalDivision.findUnique({
          where: { code_type: { code: mun.parentCode, type: 'DEPARTAMENTO' } },
        });

        if (parent) {
          await this.prisma.politicalDivision.upsert({
            where: { code_type: { code: mun.code, type: 'MUNICIPIO' } },
            update: {},
            create: {
              code: mun.code,
              name: mun.name,
              type: 'MUNICIPIO',
              parentId: parent.id,
            },
          });
        }
      }

      return {
        message: 'Datos electorales inicializados correctamente',
        tenant,
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException(
        'Error inicializando datos electorales',
      );
    }
  }

  /**
   * Obtiene todas las campañas (Tenants)
   */
  async getCampaigns() {
    return this.prisma.tenant.findMany();
  }
}
