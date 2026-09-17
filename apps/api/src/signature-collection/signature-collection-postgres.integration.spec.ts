import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  StorageObjectModule,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type {
  CreateSignatureBatchDto,
  CreateSignatureCollectionPlanDto,
  IssueSignatureBatchDto,
} from './dto/signature-collection.dto';
import {
  computeSignatureCommandSha256,
  type SignatureCommandName,
} from './signature-collection.hash';
import { SignatureCollectionService } from './signature-collection.service';

const databaseUrl =
  process.env.SIGNATURE_COLLECTION_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function command<T extends object>(
  type: SignatureCommandName,
  input: T,
  binding: object = {},
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeSignatureCommandSha256(type, {
      ...binding,
      ...input,
    }),
  };
}

physicalDescribe(
  'SignatureCollectionService on migrated physical PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let service: SignatureCollectionService;

    beforeAll(async () => {
      const adapter = new PrismaPg(
        {
          connectionString: databaseUrl,
          options: resolveDatabaseSearchPathOptions(databaseSchema),
        },
        { schema: databaseSchema },
      );
      prisma = new PrismaClient({ adapter });
      await prisma.$connect();
      service = new SignatureCollectionService(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createContext() {
      const suffix = randomUUID();
      const tenantId = `tenant-signatures-${suffix}`;
      const administratorId = `admin-signatures-${suffix}`;
      const custodianId = `custodian-signatures-${suffix}`;
      await prisma.tenant.create({
        data: {
          id: tenantId,
          slug: `signatures-${suffix}`,
          name: 'Comite ciudadano de integracion',
          type: TenantType.CANDIDACY,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: administratorId,
            tenantId,
            email: `admin-${suffix}@integration.invalid`,
            password: 'not-a-real-credential',
            name: 'Administracion de prueba',
            role: Role.ADMIN,
            isActive: true,
          },
          {
            id: custodianId,
            tenantId,
            email: `custodian-${suffix}@integration.invalid`,
            password: 'not-a-real-credential',
            name: 'Custodia de prueba',
            role: Role.ZONE_COORDINATOR,
            isActive: true,
          },
        ],
      });
      await prisma.operationProfile.create({
        data: {
          tenantId,
          operationType: PoliticalOperationType.SIGNATURE_COMMITTEE,
          stage: PoliticalOperationStage.SIGNATURE_COLLECTION,
          electionType: ElectoralContestType.MAYORALTY,
          circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
          circumscriptionName: 'Municipio de integracion',
          electionDate: new Date('2099-06-01T00:00:00.000Z'),
          votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
          votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
          expectedTeamSize: 3,
          candidateCount: 1,
          dataControllerName: 'Comite responsable de prueba',
          responsibleDataUserId: administratorId,
          retentionPeriodDays: 365,
          revocationProcedure:
            'Solicitud verificable dirigida al responsable de tratamiento.',
          createdById: administratorId,
          updatedById: administratorId,
        },
      });
      const user: AuthenticatedUser = {
        tenantId,
        userId: administratorId,
        role: Role.ADMIN,
      };
      return { tenantId, administratorId, custodianId, user };
    }

    async function createPlanAndBatch(
      context: Awaited<ReturnType<typeof createContext>>,
    ) {
      const plan = await service.createPlan(
        context.user,
        command('PLAN_CREATE', {
          clientRequestId: randomUUID(),
          committeeMemberCount: 3 as const,
          committeeEvidenceReference:
            'https://evidence.integration.invalid/committee.pdf',
          committeeEvidenceSha256: '1'.repeat(64),
          committeeRegisteredAt: '2099-01-01',
          collectionStartsAt: '2099-02-01',
          collectionClosesAt: '2099-03-01',
          candidateRegistrationClosesAt: '2099-05-01',
          requiredThreshold: 100,
          internalTarget: 130,
          thresholdSourceUrl: 'https://authority.integration.invalid/threshold',
          thresholdSourceReference: 'Acto de umbral integration 2099-01',
          thresholdSourceSha256: '2'.repeat(64),
          fileOwnerUserId: context.administratorId,
          custodyOwnerUserId: context.custodianId,
          formHandlingRules:
            'Separar anulados e incompletos, conservar todos los folios y poner cualquier diferencia bajo cuarentena documentada.',
          deliveryPlan:
            'Entrega fisica con conteo, sello opaco, recibo y verificacion independiente antes de radicar.',
          contingencyPlan:
            'Aislar el lote, preservar sus folios, documentar el incidente y detener todo traslado hasta resolverlo.',
          submissionDueAt: '2099-04-01',
        }) as CreateSignatureCollectionPlanDto,
      );
      const createdBatch = await service.createBatch(
        context.user,
        command('BATCH_CREATE', {
          clientRequestId: randomUUID(),
          code: `LOTE-${randomUUID().slice(0, 8).toUpperCase()}`,
          territoryReference: 'Zona operativa de integracion',
          plannedForms: 20,
          expectedReturnAt: '2099-02-20T18:00:00.000Z',
        }) as CreateSignatureBatchDto,
      );
      return { plan, createdBatch };
    }

    it('serializes competing issuance commands and conserves every form', async () => {
      const context = await createContext();
      const { createdBatch } = await createPlanAndBatch(context);
      const batchId = createdBatch.resource.id;
      const mutation = {
        expectedVersion: createdBatch.resource.version,
        issuedForms: 20,
        receiverUserId: context.custodianId,
        observation:
          'Se cuentan veinte formularios fisicos y se entrega el sello verificado a custodia.',
        evidenceReference:
          'https://evidence.integration.invalid/issuance/receipt',
        evidenceSha256: '3'.repeat(64),
      };
      const attempt = () =>
        service.issueBatch(
          context.user,
          batchId,
          command(
            'BATCH_ISSUE',
            { ...mutation, clientRequestId: randomUUID() },
            { batchId },
          ) as IssueSignatureBatchDto,
        );

      const outcomes = await Promise.allSettled([attempt(), attempt()]);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: { id_tenantId: { id: batchId, tenantId: context.tenantId } },
        }),
      ).resolves.toMatchObject({
        status: 'ISSUED',
        issuedForms: 20,
        returnedForms: 0,
        annulledForms: 0,
        missingForms: 0,
        inCustodyForms: 20,
        version: 2,
      });
      await expect(
        prisma.signatureCustodyEvent.count({
          where: { tenantId: context.tenantId, batchId },
        }),
      ).resolves.toBe(2);
    });

    it('enforces checks, append-only custody, rollback and signature uniqueness', async () => {
      const context = await createContext();
      const { createdBatch } = await createPlanAndBatch(context);
      const batchId = createdBatch.resource.id;

      await expect(
        prisma.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batchId, tenantId: context.tenantId } },
          data: { issuedForms: 1 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: { id_tenantId: { id: batchId, tenantId: context.tenantId } },
        }),
      ).resolves.toMatchObject({ issuedForms: 0, status: 'PLANNED' });

      const custodyEvent = await prisma.signatureCustodyEvent.findFirstOrThrow({
        where: { tenantId: context.tenantId, batchId },
      });
      await expect(
        prisma.signatureCustodyEvent.update({
          where: { id: custodyEvent.id },
          data: { observation: 'Intento de reescritura prohibido' },
        }),
      ).rejects.toThrow(/SignatureCustodyEvent is append-only/i);
      await expect(
        prisma.signatureCustodyEvent.delete({
          where: { id: custodyEvent.id },
        }),
      ).rejects.toThrow(/SignatureCustodyEvent is append-only/i);

      await expect(
        prisma.$transaction(async (transaction) => {
          await transaction.signatureCollectionBatch.update({
            where: {
              id_tenantId: { id: batchId, tenantId: context.tenantId },
            },
            data: { territoryReference: 'Cambio que debe revertirse' },
          });
          throw new Error('intentional-signature-rollback');
        }),
      ).rejects.toThrow('intentional-signature-rollback');
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: { id_tenantId: { id: batchId, tenantId: context.tenantId } },
        }),
      ).resolves.toMatchObject({
        territoryReference: 'Zona operativa de integracion',
      });

      const document = await prisma.storedObject.create({
        data: {
          tenantId: context.tenantId,
          uploaderId: context.administratorId,
          path: `${context.tenantId}/consent/${randomUUID()}.pdf`,
          module: StorageObjectModule.CONSENT,
          contentType: 'application/pdf',
          expectedSize: 128,
          expiresAt: new Date('2099-12-31T00:00:00.000Z'),
        },
      });
      await prisma.electronicSignature.create({
        data: {
          tenantId: context.tenantId,
          documentId: document.id,
          signerId: context.administratorId,
          documentHash: '4'.repeat(64),
        },
      });
      await expect(
        prisma.electronicSignature.create({
          data: {
            tenantId: context.tenantId,
            documentId: document.id,
            signerId: context.administratorId,
            documentHash: '4'.repeat(64),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  },
);
