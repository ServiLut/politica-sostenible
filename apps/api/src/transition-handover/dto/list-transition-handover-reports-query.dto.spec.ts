import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTransitionHandoverReportsQueryDto } from './list-transition-handover-reports-query.dto';

describe('ListTransitionHandoverReportsQueryDto', () => {
  it('uses bounded defaults when pagination is omitted', async () => {
    const dto = plainToInstance(ListTransitionHandoverReportsQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 25 });
  });

  it('transforms valid query strings into integers', async () => {
    const dto = plainToInstance(ListTransitionHandoverReportsQueryDto, {
      page: '3',
      limit: '100',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 100 });
  });

  it.each([
    { page: '0', limit: '25' },
    { page: '1.5', limit: '25' },
    { page: '1', limit: '101' },
  ])('rejects unsafe pagination %o', async (input) => {
    const dto = plainToInstance(ListTransitionHandoverReportsQueryDto, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
