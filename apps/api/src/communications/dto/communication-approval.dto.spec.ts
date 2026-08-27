import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CommunicationApprovalStatus,
  CommunicationChannel,
} from '../../../prisma/generated/prisma';
import { CreateCommunicationApprovalDto } from './create-communication-approval.dto';
import { DecideCommunicationApprovalDto } from './decide-communication-approval.dto';

describe('Communication approval DTO validation', () => {
  it('rejects client-controlled hashes, tenant, mode and status', async () => {
    const dto = plainToInstance(CreateCommunicationApprovalDto, {
      title: 'Informe semanal',
      message: 'Texto sujeto a revisión humana.',
      channel: CommunicationChannel.WEB,
      purpose: 'Rendición de cuentas',
      contentHash: 'client-hash',
      tenantId: 'other-tenant',
      mode: 'CAMPAIGN',
      status: 'APPROVED',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['contentHash', 'tenantId', 'mode', 'status']),
    );
  });

  it('accepts only APPROVED or REJECTED as a final decision', async () => {
    const dto = plainToInstance(DecideCommunicationApprovalDto, {
      status: CommunicationApprovalStatus.PUBLISHED,
      decisionReason: 'Intento de saltar la publicación controlada',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('rejects oversized message content before it reaches the service', async () => {
    const dto = plainToInstance(CreateCommunicationApprovalDto, {
      title: 'Informe semanal',
      message: 'x'.repeat(5001),
      channel: CommunicationChannel.EMAIL,
      purpose: 'Información institucional',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'message')).toBe(true);
  });
});
