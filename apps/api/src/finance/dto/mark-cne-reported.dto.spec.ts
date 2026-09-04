import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkCneReportedDto } from './mark-cne-reported.dto';

describe('MarkCneReportedDto', () => {
  it('normalizes a real external filing reference', async () => {
    const dto = plainToInstance(MarkCneReportedDto, {
      externalReference: '  CC-2026/004219  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.externalReference).toBe('CC-2026/004219');
  });

  it('rejects missing, tiny or markup-like references', async () => {
    for (const externalReference of ['', 'ABC', '<script>alert(1)</script>']) {
      const dto = plainToInstance(MarkCneReportedDto, { externalReference });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
    }
  });
});
