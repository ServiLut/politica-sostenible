import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePersonImportDto,
  PersonImportIdDto,
  PersonImportPageDto,
} from './person-import.dto';

describe('Mass import input contract', () => {
  const valid = {
    clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    fileName: 'PRUEBA QA.csv',
    sourceArtifactPath:
      'cmabc123defghijklmnopqrst/person-import/123e4567-e89b-42d3-a456-426614174000.csv',
    expectedContentSha256: 'a'.repeat(64),
  };
  it('accepts only a file reference and metadata, never inline file content', async () => {
    expect(
      await validate(plainToInstance(CreatePersonImportDto, valid), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CreatePersonImportDto, {
          ...valid,
          tenantId: 'foreign',
          csv: 'PII',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toEqual([]);
  });
  it.each([
    { fileName: '../file.csv' },
    { fileName: 'file.xlsx' },
    { expectedContentSha256: 'not-a-hash' },
    { sourceArtifactPath: 'https://untrusted.invalid/file.csv' },
    { clientRequestId: 'unbounded' },
  ])('rejects unsafe metadata %j', async (change) => {
    expect(
      await validate(
        plainToInstance(CreatePersonImportDto, { ...valid, ...change }),
      ),
    ).not.toEqual([]);
  });
  it('bounds pagination and requires canonical job IDs', async () => {
    expect(
      await validate(
        plainToInstance(PersonImportPageDto, { page: '1', limit: '100' }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(PersonImportPageDto, { page: '0', limit: '1000' }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(plainToInstance(PersonImportIdDto, { id: 'foreign/any' })),
    ).not.toEqual([]);
  });
});
