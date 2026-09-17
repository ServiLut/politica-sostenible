import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WorkPriority } from '../../../prisma/generated/prisma';
import {
  OfflineIncidentCategory,
  SyncOfflineIncidentDto,
} from './sync-offline-incident.dto';

const valid = {
  clientOperationId: '48d8333a-6c32-45ea-b3de-2eb8a4789389',
  capturedAt: '2026-09-09T14:30:00-05:00',
  payloadSha256: 'a'.repeat(64),
  category: OfflineIncidentCategory.LOGISTICS,
  priority: WorkPriority.HIGH,
  title: 'Falta material operativo',
  description: 'El punto reporta faltante del insumo operativo previsto.',
  occurredOn: '2026-09-09',
  divisionId: 'zona_01',
};

describe('SyncOfflineIncidentDto', () => {
  it('acepta únicamente el contrato mínimo, con UUID v4 y fecha zonificada', async () => {
    const dto = plainToInstance(SyncOfflineIncidentDto, valid);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [
      'UUID no v4',
      { clientOperationId: '48d8333a-6c32-15ea-b3de-2eb8a4789389' },
    ],
    ['timestamp sin zona', { capturedAt: '2026-09-09T14:30:00' }],
    ['SHA no canónico', { payloadSha256: 'A'.repeat(64) }],
    ['fecha no civil', { occurredOn: '2026-09-09T00:00:00Z' }],
    ['categoría libre', { category: 'PERSONAL_DATA' }],
  ])('rechaza %s', async (_label, patch) => {
    const dto = plainToInstance(SyncOfflineIncidentDto, { ...valid, ...patch });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
