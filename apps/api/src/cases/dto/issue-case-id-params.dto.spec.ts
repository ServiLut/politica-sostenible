import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IssueCaseIdParamsDto } from './issue-case-id-params.dto';

describe('IssueCaseIdParamsDto', () => {
  it.each(['ckl0z7u4f0000qzrmn831i7rn', randomUUID()])(
    'accepts an identifier produced by a supported case creation flow: %s',
    async (id) => {
      const dto = plainToInstance(IssueCaseIdParamsDto, { id });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it.each([
    '',
    'arbitrary-resource',
    'cshort',
    'CKL0Z7U4F0000QZRMN831I7RN',
    ' df774561-9738-4d8b-98ea-c8d304b38dd3',
    'DF774561-9738-4D8B-98EA-C8D304B38DD3',
    'df774561-9738-1d8b-98ea-c8d304b38dd3',
    'df774561-9738-4d8b-18ea-c8d304b38dd3',
    '00000000-0000-0000-0000-000000000000',
    '../ckl0z7u4f0000qzrmn831i7rn',
    'ckl0z7u4f0000qzrmn831i7rn/extra',
    'ckl0z7u4f0000qzrmn831i7rn\n',
    null,
    123,
  ])('rejects an invalid or noncanonical identifier: %s', async (id) => {
    const dto = plainToInstance(IssueCaseIdParamsDto, { id });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
