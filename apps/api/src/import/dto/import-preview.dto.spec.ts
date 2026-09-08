import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportModuleParamDto, ImportPreviewDto } from './import-preview.dto';

describe('Import DTO validation', () => {
  it('accepts the supported module and a bounded CSV body', async () => {
    const params = plainToInstance(ImportModuleParamDto, {
      module: 'personas',
    });
    const body = plainToInstance(ImportPreviewDto, {
      csv: 'Documento,Nombre,Apellido\n1012345678,Ana,Perez',
    });

    await expect(validate(params)).resolves.toHaveLength(0);
    await expect(validate(body)).resolves.toHaveLength(0);
  });

  it('rejects unsupported modules, empty bodies and oversized input', async () => {
    const params = plainToInstance(ImportModuleParamDto, {
      module: '../votantes',
    });
    const emptyBody = plainToInstance(ImportPreviewDto, { csv: '' });
    const oversizedBody = plainToInstance(ImportPreviewDto, {
      csv: 'x'.repeat(100_001),
    });

    await expect(validate(params)).resolves.not.toHaveLength(0);
    await expect(validate(emptyBody)).resolves.not.toHaveLength(0);
    await expect(validate(oversizedBody)).resolves.not.toHaveLength(0);
  });
});
