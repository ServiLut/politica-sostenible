import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import {
  AuditActorType,
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { IdentityService } from '../common/services/identity.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import {
  CANONICAL_PHONE_PATTERN,
  normalizePhoneInput,
} from '../common/utils/phone-normalization.util';
import { PrismaService } from '../prisma/prisma.service';

interface ParsedCsvRow {
  lineNumber: number;
  fields: Record<string, string>;
}

interface ParsedCsvRecord {
  lineNumber: number;
  values: string[];
}

interface ImportContext {
  noticeVersion: string;
  noticeActivatedAt: Date;
}

type ImportContextClient = Pick<
  Prisma.TransactionClient,
  'tenant' | 'user' | 'consentNotice' | 'operationProfile'
>;

export interface VoterImportPreviewRow {
  documentId: string;
  firstName: string;
  lastName: string;
  status: 'new' | 'duplicate_file' | 'duplicate_db';
}

const IMPORT_ROLES = [Role.ADMIN, Role.CAMPAIGN_MANAGER] as const;
const MAX_IMPORT_ROWS = 500;
const REQUIRED_HEADERS = [
  'Documento',
  'Nombre',
  'Apellido',
  'Consentimiento',
  'Version aviso',
  'Fecha consentimiento',
  'Ruta evidencia',
] as const;
const CONSENT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp|pdf)$/i;
const ISO_UTC_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
  ) {}

  async preview(
    moduleName: string,
    csvContent: string,
    user: AuthenticatedUser,
  ) {
    this.assertSupportedModule(moduleName);
    const context = await this.loadImportContext(this.prisma, user);
    const rows = this.parseCsv(csvContent);
    const validation = await this.validateVoters(rows, user.tenantId, context);
    const evidenceErrors = await this.validateAvailableEvidence(
      rows,
      validation.preview,
      user.tenantId,
    );

    return {
      ...validation,
      validRows: Math.max(0, validation.validRows - evidenceErrors.length),
      errorRows: [...validation.errorRows, ...evidenceErrors],
    };
  }

  async execute(
    moduleName: string,
    csvContent: string,
    user: AuthenticatedUser,
  ) {
    this.assertSupportedModule(moduleName);
    const context = await this.loadImportContext(this.prisma, user);
    const rows = this.parseCsv(csvContent);
    const validation = await this.validateVoters(rows, user.tenantId, context);
    const evidenceErrors = await this.validateAvailableEvidence(
      rows,
      validation.preview,
      user.tenantId,
    );
    const allErrors = [...validation.errorRows, ...evidenceErrors];

    if (allErrors.length > 0) {
      throw new BadRequestException({
        message: 'El archivo contiene errores. Revise la vista previa.',
        errors: allErrors,
      });
    }

    const rowsToImport = validation.preview.filter(
      (candidate) => candidate.status === 'new',
    );

    return this.prisma.$transaction(
      async (transaction) => {
        const currentContext = await this.loadImportContext(transaction, user);
        if (currentContext.noticeVersion !== context.noticeVersion) {
          throw new BadRequestException(
            'El aviso de privacidad cambió durante la importación. Genere una nueva vista previa.',
          );
        }

        const puestos = await transaction.politicalDivision.findMany({
          where: { tenantId: user.tenantId, type: DivisionType.PUESTO },
          select: { id: true, name: true, code: true },
        });

        let imported = 0;
        let skippedDuringExecution = 0;

        for (const candidate of rowsToImport) {
          // Validation guarantees uniqueness. Selecting the same first row
          // used to build the preview also prevents a future regression from
          // silently switching to the last duplicate during execution.
          const row = rows.find(
            (source) =>
              this.csvValue(source, 'Documento') === candidate.documentId,
          );
          if (!row) continue;

          const existing = await transaction.voter.findUnique({
            where: {
              documentId_tenantId: {
                documentId: candidate.documentId,
                tenantId: user.tenantId,
              },
            },
            select: { id: true },
          });
          if (existing) {
            skippedDuringExecution += 1;
            continue;
          }

          const puestoValue = this.csvValue(row, 'Puesto');
          const puesto = puestoValue
            ? puestos.find(
                (item) =>
                  item.name.toLocaleLowerCase('es-CO') ===
                    puestoValue.toLocaleLowerCase('es-CO') ||
                  item.code === puestoValue,
              )
            : undefined;
          if (puestoValue && !puesto) {
            throw new BadRequestException(
              `El puesto de la fila ${row.lineNumber} no existe en la organización`,
            );
          }

          const grantedAt = new Date(
            this.csvValue(row, 'Fecha consentimiento'),
          );
          const proofPath = this.csvValue(row, 'Ruta evidencia');
          const rawPhone = this.csvValue(row, 'Teléfono');
          const normalizedPhone = normalizePhoneInput(rawPhone);
          const mesaValue = this.csvValue(row, 'Mesa');

          const voter = await transaction.voter.create({
            data: {
              documentId: candidate.documentId,
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              phone:
                rawPhone && typeof normalizedPhone === 'string'
                  ? normalizedPhone
                  : null,
              email: this.csvValue(row, 'Correo').toLowerCase() || null,
              puestoId: puesto?.id ?? null,
              mesa: mesaValue ? Number(mesaValue) : null,
              tenantId: user.tenantId,
              registrarId: user.userId,
              consentAccepted: true,
              consentTimestamp: grantedAt,
              termsVersion: currentContext.noticeVersion,
            },
            select: { id: true },
          });

          await consumeConfirmedStorageUpload(
            transaction,
            user.tenantId,
            proofPath,
            StorageObjectModule.CONSENT,
            'VoterConsent',
            voter.id,
          );

          await transaction.consentRecord.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              subjectType: ConsentSubjectType.VOTER,
              subjectRef: voter.id,
              voterId: voter.id,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
              status: ConsentStatus.GRANTED,
              collectionChannel: ConsentCollectionChannel.IMPORT,
              noticeVersion: currentContext.noticeVersion,
              proofPath,
              capturedById: user.userId,
              grantedAt,
            },
          });
          imported += 1;
        }

        const skipped =
          validation.preview.filter((candidate) => candidate.status !== 'new')
            .length + skippedDuringExecution;

        await transaction.auditEvent.create({
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
              totalRows: validation.totalRows,
              imported,
              skipped,
              errors: 0,
              noticeVersion: currentContext.noticeVersion,
              evidenceRequired: true,
            },
          },
        });

        return { success: true, imported, skipped };
      },
      { timeout: 30_000 },
    );
  }

  private assertSupportedModule(moduleName: string): void {
    if (moduleName !== 'personas') {
      throw new BadRequestException(
        `Módulo no soportado para importación: ${moduleName}`,
      );
    }
  }

  private async loadImportContext(
    client: ImportContextClient,
    user: AuthenticatedUser,
  ): Promise<ImportContext> {
    const [tenant, actor, activeNotice, profile] = await Promise.all([
      client.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      client.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId, isActive: true },
        select: { role: true },
      }),
      client.consentNotice.findFirst({
        where: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          isActive: true,
        },
        select: { version: true, activatedAt: true },
      }),
      client.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true },
      }),
    ]);

    assertCampaignTenant(tenant);
    if (
      !actor ||
      !IMPORT_ROLES.includes(actor.role as (typeof IMPORT_ROLES)[number])
    ) {
      throw new ForbiddenException(
        'El usuario no tiene permisos vigentes para importar personas.',
      );
    }
    if (!activeNotice) {
      throw new ForbiddenException(
        'No se puede importar personas sin un aviso de privacidad activo.',
      );
    }
    if (!profile) {
      throw new ForbiddenException(
        'No se puede importar personas sin configurar el perfil operativo.',
      );
    }

    return {
      noticeVersion: activeNotice.version,
      noticeActivatedAt: activeNotice.activatedAt,
    };
  }

  private parseCsv(csv: string): ParsedCsvRow[] {
    const normalized = csv
      .replace(/^\uFEFF/u, '')
      .replace(/\r\n/gu, '\n')
      .replace(/\r/gu, '\n');
    if (!normalized.trim()) {
      throw new BadRequestException('El CSV no contiene registros');
    }

    const delimiter = this.detectDelimiter(normalized);
    const records = this.parseCsvRecords(normalized, delimiter).filter(
      (record) => record.values.some((value) => value.trim().length > 0),
    );
    if (records.length < 2) {
      throw new BadRequestException(
        'El CSV debe incluir encabezados y al menos un registro',
      );
    }
    if (records.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `El CSV supera el máximo de ${MAX_IMPORT_ROWS} registros por lote`,
      );
    }

    const headers = records[0].values.map((header) => header.trim());
    if (headers.some((header) => !header)) {
      throw new BadRequestException('El CSV contiene encabezados vacíos');
    }
    if (new Set(headers).size !== headers.length) {
      throw new BadRequestException('El CSV contiene encabezados duplicados');
    }
    const missingHeaders = REQUIRED_HEADERS.filter(
      (header) => !headers.includes(header),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias: ${missingHeaders.join(', ')}`,
      );
    }

    return records.slice(1).map((record) => {
      if (record.values.length !== headers.length) {
        throw new BadRequestException(
          `La fila ${record.lineNumber} tiene ${record.values.length} columnas; se esperaban ${headers.length}`,
        );
      }
      return {
        lineNumber: record.lineNumber,
        fields: Object.fromEntries(
          headers.map((header, index) => [header, record.values[index] ?? '']),
        ),
      };
    });
  }

  private detectDelimiter(csv: string): ',' | ';' {
    let inQuotes = false;
    let commas = 0;
    let semicolons = 0;

    for (let index = 0; index < csv.length; index += 1) {
      const character = csv[index];
      if (character === '"') {
        if (inQuotes && csv[index + 1] === '"') {
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && character === '\n') {
        break;
      } else if (!inQuotes && character === ',') {
        commas += 1;
      } else if (!inQuotes && character === ';') {
        semicolons += 1;
      }
    }

    if (commas === 0 && semicolons === 0) {
      throw new BadRequestException(
        'No se pudo identificar el separador CSV (coma o punto y coma)',
      );
    }
    if (commas === semicolons) {
      throw new BadRequestException('El separador del CSV es ambiguo');
    }
    return commas > semicolons ? ',' : ';';
  }

  private parseCsvRecords(
    csv: string,
    delimiter: ',' | ';',
  ): ParsedCsvRecord[] {
    const records: ParsedCsvRecord[] = [];
    let values: string[] = [];
    let field = '';
    let inQuotes = false;
    let afterClosingQuote = false;
    let lineNumber = 1;
    let recordLineNumber = 1;

    const finishField = () => {
      values.push(field.trim());
      field = '';
      afterClosingQuote = false;
    };
    const finishRecord = () => {
      finishField();
      records.push({ lineNumber: recordLineNumber, values });
      values = [];
      recordLineNumber = lineNumber + 1;
    };

    for (let index = 0; index < csv.length; index += 1) {
      const character = csv[index];
      if (inQuotes) {
        if (character === '"' && csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
          afterClosingQuote = true;
        } else {
          field += character;
          if (character === '\n') lineNumber += 1;
        }
        continue;
      }

      if (afterClosingQuote) {
        if (character === delimiter) {
          finishField();
        } else if (character === '\n') {
          finishRecord();
          lineNumber += 1;
        } else if (!/\s/u.test(character)) {
          throw new BadRequestException(
            `Carácter inesperado después de comillas en la línea ${lineNumber}`,
          );
        }
        continue;
      }

      if (character === '"') {
        if (field.trim()) {
          throw new BadRequestException(
            `Comillas inválidas en la línea ${lineNumber}`,
          );
        }
        field = '';
        inQuotes = true;
      } else if (character === delimiter) {
        finishField();
      } else if (character === '\n') {
        finishRecord();
        lineNumber += 1;
      } else {
        field += character;
      }
    }

    if (inQuotes) {
      throw new BadRequestException('El CSV contiene comillas sin cerrar');
    }
    if (field.length > 0 || values.length > 0 || afterClosingQuote) {
      finishRecord();
    }
    return records;
  }

  private csvValue(row: ParsedCsvRow, header: string): string {
    return row.fields[header]?.trim() ?? '';
  }

  private async validateVoters(
    rows: ParsedCsvRow[],
    tenantId: string,
    context: ImportContext,
  ) {
    const errorRows: { row: number; field: string; message: string }[] = [];
    let duplicatesInDatabase = 0;
    const preview: VoterImportPreviewRow[] = [];
    const documents = new Set<string>();
    const evidencePaths = new Set<string>();
    const documentOccurrences = new Map<string, number>();
    for (const row of rows) {
      const documentId = this.csvValue(row, 'Documento');
      if (!documentId) continue;
      documentOccurrences.set(
        documentId,
        (documentOccurrences.get(documentId) ?? 0) + 1,
      );
    }
    const duplicateDocuments = new Set(
      [...documentOccurrences.entries()]
        .filter(([, occurrences]) => occurrences > 1)
        .map(([documentId]) => documentId),
    );
    const duplicatesInFile = [...documentOccurrences.values()].reduce(
      (total, occurrences) => total + Math.max(0, occurrences - 1),
      0,
    );
    const now = Date.now();
    const requestedPuestos = new Set(
      rows.map((row) => this.csvValue(row, 'Puesto')).filter(Boolean),
    );
    const puestos =
      requestedPuestos.size === 0
        ? []
        : await this.prisma.politicalDivision.findMany({
            where: {
              tenantId,
              type: DivisionType.PUESTO,
            },
            select: { name: true, code: true },
          });

    for (const row of rows) {
      const errorsBefore = errorRows.length;
      const documentId = this.csvValue(row, 'Documento');
      const firstName = this.csvValue(row, 'Nombre');
      const lastName = this.csvValue(row, 'Apellido');
      const phone = this.csvValue(row, 'Teléfono');
      const email = this.csvValue(row, 'Correo');
      const puesto = this.csvValue(row, 'Puesto');
      const mesa = this.csvValue(row, 'Mesa');
      const consent = this.csvValue(row, 'Consentimiento').toUpperCase();
      const noticeVersion = this.csvValue(row, 'Version aviso');
      const grantedAtValue = this.csvValue(row, 'Fecha consentimiento');
      const proofPath = this.csvValue(row, 'Ruta evidencia');

      const addError = (field: string, message: string) =>
        errorRows.push({ row: row.lineNumber, field, message });

      if (!documentId || !firstName || !lastName) {
        addError('General', 'Documento, Nombre y Apellido son obligatorios');
      } else {
        if (!this.identityService.validateCedula(documentId)) {
          addError('Documento', 'Formato de documento inválido');
        }
        if (firstName.length > 100 || this.hasControlCharacters(firstName)) {
          addError('Nombre', 'El nombre no tiene un formato válido');
        }
        if (lastName.length > 100 || this.hasControlCharacters(lastName)) {
          addError('Apellido', 'El apellido no tiene un formato válido');
        }
      }

      const normalizedPhone = normalizePhoneInput(phone);
      if (
        phone &&
        (typeof normalizedPhone !== 'string' ||
          !CANONICAL_PHONE_PATTERN.test(normalizedPhone))
      ) {
        addError('Teléfono', 'El teléfono no tiene un formato válido');
      }
      if (email && (email.length > 254 || !isEmail(email))) {
        addError('Correo', 'El correo no tiene un formato válido');
      }
      if (
        puesto &&
        !puestos.some(
          (candidate) =>
            candidate.name.toLocaleLowerCase('es-CO') ===
              puesto.toLocaleLowerCase('es-CO') || candidate.code === puesto,
        )
      ) {
        addError('Puesto', 'El puesto no existe en la organización');
      }
      if (mesa && (!/^\d{1,5}$/u.test(mesa) || Number(mesa) < 1)) {
        addError('Mesa', 'La mesa debe ser un entero entre 1 y 99999');
      }
      if (consent !== 'SI') {
        addError(
          'Consentimiento',
          'Debe indicar SI únicamente cuando exista autorización expresa verificable',
        );
      }
      if (noticeVersion !== context.noticeVersion) {
        addError(
          'Version aviso',
          `Debe coincidir con la versión activa ${context.noticeVersion}`,
        );
      }

      const grantedAt = new Date(grantedAtValue);
      if (
        !ISO_UTC_DATE_PATTERN.test(grantedAtValue) ||
        Number.isNaN(grantedAt.getTime())
      ) {
        addError(
          'Fecha consentimiento',
          'La fecha de consentimiento debe ser ISO 8601',
        );
      } else if (
        grantedAt.getTime() < context.noticeActivatedAt.getTime() ||
        grantedAt.getTime() > now
      ) {
        addError(
          'Fecha consentimiento',
          'La fecha debe estar entre la activación del aviso vigente y el momento actual',
        );
      }

      if (!this.isCanonicalConsentPath(tenantId, proofPath)) {
        addError(
          'Ruta evidencia',
          'La ruta debe ser una evidencia confirmada del módulo consent y del tenant activo',
        );
      } else if (evidencePaths.has(proofPath)) {
        addError(
          'Ruta evidencia',
          'Cada persona debe tener una evidencia única y no reutilizada',
        );
      } else {
        evidencePaths.add(proofPath);
      }

      if (duplicateDocuments.has(documentId)) {
        addError(
          'Documento',
          'El documento aparece más de una vez en el archivo; conserve una sola fila verificable',
        );
        preview.push({
          documentId,
          firstName,
          lastName,
          status: 'duplicate_file',
        });
        continue;
      }

      if (errorRows.length > errorsBefore) continue;

      documents.add(documentId);
    }

    const existingVoters =
      documents.size === 0
        ? []
        : await this.prisma.voter.findMany({
            where: {
              tenantId,
              documentId: { in: [...documents] },
            },
            select: { documentId: true },
          });
    const existingDocuments = new Set(
      existingVoters.map((voter) => voter.documentId),
    );

    let validRows = 0;
    for (const documentId of documents) {
      const row = rows.find(
        (candidate) => this.csvValue(candidate, 'Documento') === documentId,
      );
      const firstName = row ? this.csvValue(row, 'Nombre') : '';
      const lastName = row ? this.csvValue(row, 'Apellido') : '';
      if (existingDocuments.has(documentId)) {
        duplicatesInDatabase += 1;
        preview.push({
          documentId,
          firstName,
          lastName,
          status: 'duplicate_db',
        });
      } else {
        validRows += 1;
        preview.push({
          documentId,
          firstName,
          lastName,
          status: 'new',
        });
      }
    }

    return {
      totalRows: rows.length,
      validRows,
      errorRows,
      duplicatesInFile,
      duplicatesInDatabase,
      preview,
    };
  }

  private async validateAvailableEvidence(
    rows: ParsedCsvRow[],
    preview: VoterImportPreviewRow[],
    tenantId: string,
  ) {
    const newDocuments = new Set(
      preview
        .filter((candidate) => candidate.status === 'new')
        .map((candidate) => candidate.documentId),
    );
    const candidates = rows
      .filter((row) => newDocuments.has(this.csvValue(row, 'Documento')))
      .map((row) => ({
        row: row.lineNumber,
        path: this.csvValue(row, 'Ruta evidencia'),
      }));
    if (candidates.length === 0) return [];

    const storedObjects = await this.prisma.storedObject.findMany({
      where: {
        tenantId,
        path: { in: candidates.map((candidate) => candidate.path) },
        module: StorageObjectModule.CONSENT,
        status: StoredObjectStatus.CONFIRMED,
        consumedAt: null,
      },
      select: { path: true },
    });
    const available = new Set(storedObjects.map((object) => object.path));

    return candidates
      .filter((candidate) => !available.has(candidate.path))
      .map((candidate) => ({
        row: candidate.row,
        field: 'Ruta evidencia',
        message:
          'La evidencia no existe, no fue confirmada o ya está asociada a otro registro',
      }));
  }

  private isCanonicalConsentPath(tenantId: string, path: string): boolean {
    const prefix = `${tenantId}/consent/`;
    return (
      path.startsWith(prefix) &&
      CONSENT_PATH_PATTERN.test(path.slice(prefix.length))
    );
  }

  private hasControlCharacters(value: string): boolean {
    return [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
  }
}
