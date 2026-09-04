import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IssueCaseStatus } from '../../../prisma/generated/prisma';
import { UpdateIssueCaseDto } from './update-issue-case.dto';

describe('UpdateIssueCaseDto resolution contract', () => {
  it('accepts a resolved transition request without client-authored evidence', async () => {
    const dto = plainToInstance(UpdateIssueCaseDto, {
      status: IssueCaseStatus.RESOLVED,
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('rejects a client-authored resolution readiness flag', async () => {
    const dto = plainToInstance(UpdateIssueCaseDto, {
      status: IssueCaseStatus.RESOLVED,
      resolutionReady: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'resolutionReady')).toBe(
      true,
    );
  });
});
