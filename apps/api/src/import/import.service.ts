import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../common/services/identity.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PoliticalOperationMode, AuditActorType, ConsentPurpose, ConsentLegalBasis, ConsentStatus, ConsentCollectionChannel, DivisionType } from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly consentEvidence: ConsentEvidenceService,
  ) {}

  async preview(moduleName: string, csvContent: string, user: AuthenticatedUser) {
    if (moduleName !== 'personas') {
      throw new BadRequestException(`Módulo no soportado para importación: ${moduleName}`);
    }

    const rows = this.parseCsv(csvContent);
    return this.validateVoters(rows, user.tenantId);
  }

  async execute(moduleName: string, csvContent: string, user: AuthenticatedUser) {
    if (moduleName !== 'personas') {
      throw new BadRequestException(`Módulo no soportado para importación: ${moduleName}`);
    }

    const activeNotice = await this.prisma.consentNotice.findFirst({
      where: { tenantId: user.tenantId, mode: PoliticalOperationMode.CAMPAIGN, isActive: true },
    });
    if (!activeNotice) {
      throw new ForbiddenException('No se puede registrar personas sin un aviso de privacidad activo.');
    }

    const profile = await this.prisma.operationProfile.findUnique({
      where: { tenantId: user.tenantId },
    });
    if (!profile) {
      throw new ForbiddenException('No se puede registrar personas sin configurar el perfil operativo.');
    }

    const rows = this.parseCsv(csvContent);
    const { preview, validRows, totalRows, errorRows } = await this.validateVoters(rows, user.tenantId);

    if (errorRows.length > 0) {
      throw new BadRequestException('El archivo contiene errores. Revise la vista previa.');
    }

    const rowsToImport = preview.filter(p => p.status === 'new');
    
    await this.prisma.$transaction(async (tx) => {
      const puestos = await tx.politicalDivision.findMany({
        where: { tenantId: user.tenantId, type: DivisionType.PUESTO },
        select: { id: true, name: true, code: true }
      });
      
      const consentIp = '0.0.0.0';
      const sourceIpHash = this.consentEvidence.hashIp(consentIp);
      const grantedAt = new Date();

      for (const row of rowsToImport) {
        const origRow = rows.find(r => r.Documento === row.documentId);
        if (!origRow) continue;
        
        let puestoId: string | null = null;
        if (origRow.Puesto) {
          const match = puestos.find(p => p.name.toLowerCase() === origRow.Puesto.trim().toLowerCase() || p.code === origRow.Puesto.trim());
          if (match) puestoId = match.id;
        }

        const voterData = {
          documentId: origRow.Documento,
          firstName: origRow.Nombre,
          lastName: origRow.Apellido,
          phone: origRow.Teléfono || null,
          email: origRow.Correo || null,
          puestoId,
          mesa: origRow.Mesa ? parseInt(origRow.Mesa, 10) : null,
        };
        
        const voter = await tx.voter.create({
          data: {
            ...voterData,
            tenantId: user.tenantId,
            registrarId: user.userId,
            consentAccepted: true,
            consentIp: sourceIpHash,
            consentTimestamp: grantedAt,
            termsVersion: activeNotice.version,
          },
        });
        
        await tx.consentRecord.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            subjectType: 'VOTER',
            subjectRef: voter.id,
            voterId: voter.id,
            purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
            legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
            status: ConsentStatus.GRANTED,
            collectionChannel: ConsentCollectionChannel.PAPER,
            noticeVersion: activeNotice.version,
            sourceIpHash,
            capturedById: user.userId,
            grantedAt,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'DATA_IMPORT_EXECUTED',
          resourceType: 'Voter',
          resourceId: 'BATCH',
          metadata: {
            module: moduleName,
            totalRows: totalRows,
            imported: rowsToImport.length,
            skipped: preview.filter(p => p.status !== 'new').length,
            errors: errorRows.length
          },
        },
      });
    }, {
      timeout: 30000,
    });
    
    return { success: true, imported: rowsToImport.length };
  }

  private parseCsv(csv: string): Record<string, any>[] {
    const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [] as Record<string, any>[]; 
    
    const headers = this.parseCsvLine(lines[0]);
    const data: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      row['_row'] = i + 1;
      data.push(row);
    }
    return data;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private async validateVoters(rows: Record<string, any>[], tenantId: string) {
    let validRows = 0;
    const errorRows: { row: number; field: string; message: string }[] = [];
    let duplicatesInFile = 0;
    let duplicatesInDatabase = 0;
    const preview: { documentId: string; firstName: string; lastName: string; status: 'new' | 'duplicate_file' | 'duplicate_db' }[] = [];
    
    const docSet = new Set<string>();

    for (const row of rows) {
      const rowNum = row['_row'];
      const doc = row['Documento'];
      const nombre = row['Nombre'];
      const apellido = row['Apellido'];
      
      if (!doc || !nombre || !apellido) {
        errorRows.push({ row: rowNum, field: 'General', message: 'Documento, Nombre y Apellido son obligatorios' });
        continue;
      }

      if (!this.identityService.validateCedula(doc)) {
        errorRows.push({ row: rowNum, field: 'Documento', message: 'Formato de documento inválido' });
        continue;
      }
      
      if (docSet.has(doc)) {
        duplicatesInFile++;
        preview.push({
          documentId: doc,
          firstName: nombre,
          lastName: apellido,
          status: 'duplicate_file'
        });
        continue;
      }
      docSet.add(doc);
    }
    
    const existingVoters = await this.prisma.voter.findMany({
      where: {
        tenantId,
        documentId: { in: Array.from(docSet) }
      },
      select: { documentId: true }
    });
    const existingDocs = new Set(existingVoters.map(v => v.documentId));

    for (const doc of docSet) {
      const row = rows.find(r => r['Documento'] === doc);
      if (existingDocs.has(doc)) {
        duplicatesInDatabase++;
        preview.push({
          documentId: doc,
          firstName: row?.['Nombre'] || '',
          lastName: row?.['Apellido'] || '',
          status: 'duplicate_db'
        });
      } else {
        validRows++;
        preview.push({
          documentId: doc,
          firstName: row?.['Nombre'] || '',
          lastName: row?.['Apellido'] || '',
          status: 'new'
        });
      }
    }
    
    return {
      totalRows: rows.length,
      validRows,
      errorRows,
      duplicatesInFile,
      duplicatesInDatabase,
      preview
    };
  }
}
