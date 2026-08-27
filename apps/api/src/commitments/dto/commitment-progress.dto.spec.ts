import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateCommitmentDto } from './create-commitment.dto';
import { UpdateCommitmentDto } from './update-commitment.dto';

describe('Commitment progress DTO validation', () => {
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
});
