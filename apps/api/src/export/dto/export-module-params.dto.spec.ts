import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EXPORT_MODULES,
  ExportModuleParamsDto,
} from './export-module-params.dto';

describe('ExportModuleParamsDto', () => {
  it.each(EXPORT_MODULES)('accepts supported module %s', async (module) => {
    const params = plainToInstance(ExportModuleParamsDto, { module });

    await expect(validate(params)).resolves.toHaveLength(0);
  });

  it.each(['', 'finanzas', 'TAREAS', '../personas', 'personas.csv'])(
    'rejects unsupported module %p',
    async (module) => {
      const errors = await validate(
        plainToInstance(ExportModuleParamsDto, { module }),
      );

      expect(errors.map(({ property }) => property)).toContain('module');
    },
  );

  it('rejects client-controlled tenant context', async () => {
    const errors = await validate(
      plainToInstance(ExportModuleParamsDto, {
        module: 'tareas',
        tenantId: 'tenant-controlled-by-client',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map(({ property }) => property)).toContain('tenantId');
  });
});
