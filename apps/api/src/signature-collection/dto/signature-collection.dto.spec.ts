import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignatureAuthorityOutcome } from '../../../prisma/generated/prisma';
import {
  CreateSignatureCollectionPlanDto,
  RecordSignatureAuthorityResultDto,
} from './signature-collection.dto';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const hash = 'a'.repeat(64);

function planInput() {
  return {
    clientRequestId: uuid,
    payloadSha256: hash,
    committeeMemberCount: 3,
    committeeEvidenceReference: 'https://autoridad.example/constancia.pdf',
    committeeEvidenceSha256: hash,
    committeeRegisteredAt: '2026-01-01',
    collectionStartsAt: '2026-02-01',
    collectionClosesAt: '2026-05-01',
    candidateRegistrationClosesAt: '2026-06-01',
    requiredThreshold: 100,
    internalTarget: 130,
    thresholdSourceUrl: 'https://autoridad.example/acto',
    thresholdSourceReference: 'Resolucion verificable 2026',
    thresholdSourceSha256: hash,
    fileOwnerUserId: 'owner-one',
    custodyOwnerUserId: 'owner-two',
    formHandlingRules:
      'Reglas documentadas para formularios anulados, incompletos, duplicados, fotocopiados, impresos, intervenidos y puestos en cuarentena.',
    deliveryPlan:
      'Entrega fisica programada con conteo doble, recibo y responsable asignado.',
    contingencyPlan:
      'Contingencia fisica con inventario alterno, escalamiento y acta de cierre.',
    submissionDueAt: '2026-05-15',
  };
}

describe('signature collection DTOs', () => {
  it('accepts the exact non-personal plan contract', async () => {
    const errors = await validate(
      plainToInstance(CreateSignatureCollectionPlanDto, planInput()),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors).toEqual([]);
  });

  it('rejects a committee other than three and unsafe evidence URL', async () => {
    const errors = await validate(
      plainToInstance(CreateSignatureCollectionPlanDto, {
        ...planInput(),
        committeeMemberCount: 2,
        committeeEvidenceReference: 'http://inseguro.example/constancia',
      }),
    );
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'committeeMemberCount',
        'committeeEvidenceReference',
      ]),
    );
  });

  it('rejects supporter PII as a non-whitelisted property', async () => {
    const errors = await validate(
      plainToInstance(CreateSignatureCollectionPlanDto, {
        ...planInput(),
        supporterDocument: '123456789',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors).toEqual([
      expect.objectContaining({ property: 'supporterDocument' }),
    ]);
  });

  it('validates authority totals without declaring an internal calculation official', async () => {
    const errors = await validate(
      plainToInstance(RecordSignatureAuthorityResultDto, {
        clientRequestId: uuid,
        payloadSha256: hash,
        authorityName: 'Registraduria competente',
        authorityActReference: 'Acto 123 de 2026',
        authorityActIssuedAt: '2026-06-01',
        evidenceReference: 'https://autoridad.example/acto-123.pdf',
        evidenceSha256: hash,
        submittedSupports: 120,
        validSupports: 101,
        invalidSupports: 19,
        outcome: SignatureAuthorityOutcome.THRESHOLD_MET,
      }),
    );
    expect(errors).toEqual([]);
  });
});
