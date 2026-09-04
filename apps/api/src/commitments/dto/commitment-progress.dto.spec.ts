import 'reflect-metadata';
import { validate } from 'class-validator';
import { CommitmentStatus } from '../../../prisma/generated/prisma';
import { CreateCommitmentDto } from './create-commitment.dto';
import { UpdateCommitmentDto } from './update-commitment.dto';

describe('Commitment progress DTO validation', () => {
  it.each([
    [CreateCommitmentDto, { status: null }],
    [CreateCommitmentDto, { progress: null }],
    [UpdateCommitmentDto, { status: null }],
    [UpdateCommitmentDto, { progress: null }],
  ])('rejects null status or progress values', async (DtoClass, override) => {
    const dto = Object.assign(new DtoClass(), {
      ...(DtoClass === CreateCommitmentDto
        ? {
            reference: 'CMP-NULL',
            title: 'Compromiso',
            description: 'Validación de entrada',
          }
        : {}),
      ...override,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it.each([-1, 101])('rejects progress outside 0-100: %s', async (progress) => {
    const dto = Object.assign(new CreateCommitmentDto(), {
      reference: 'CMP-001',
      title: 'Compromiso',
      description: 'Descripción verificable',
      progress,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'progress')).toBe(true);
  });

  it.each([0, 50, 100])('accepts progress in range: %s', async (progress) => {
    const dto = Object.assign(new UpdateCommitmentDto(), { progress });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([undefined, 99])(
    'rejects creating a fulfilled commitment without 100%% progress: %s',
    async (progress) => {
      const dto = Object.assign(new CreateCommitmentDto(), {
        reference: 'CMP-FULFILLED',
        title: 'Compromiso cumplido',
        description: 'Debe tener avance final verificable',
        status: CommitmentStatus.FULFILLED,
        progress,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'status')).toBe(true);
    },
  );

  it('accepts creating a fulfilled commitment at 100% progress', async () => {
    const dto = Object.assign(new CreateCommitmentDto(), {
      reference: 'CMP-FULFILLED',
      title: 'Compromiso cumplido',
      description: 'Tiene avance final verificable',
      status: CommitmentStatus.FULFILLED,
      progress: 100,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an explicitly inconsistent fulfilled update', async () => {
    const dto = Object.assign(new UpdateCommitmentDto(), {
      status: CommitmentStatus.FULFILLED,
      progress: 80,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('lets the service resolve persisted progress when an update omits it', async () => {
    const dto = Object.assign(new UpdateCommitmentDto(), {
      status: CommitmentStatus.FULFILLED,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
