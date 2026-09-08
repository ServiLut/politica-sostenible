import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StorageModuleName } from '../storage.constants';
import { CompleteUploadDto } from './complete-upload.dto';
import { CreateDownloadUrlDto } from './create-download-url.dto';
import { CreateUploadUrlDto } from './create-upload-url.dto';

describe('Consent storage DTO validation', () => {
  it('accepts consent upload and completion payloads', async () => {
    const upload = plainToInstance(CreateUploadUrlDto, {
      module: StorageModuleName.CONSENT,
      fileName: 'evidencia.pdf',
      contentType: 'application/pdf',
      size: 100,
    });
    const completion = plainToInstance(CompleteUploadDto, {
      module: StorageModuleName.CONSENT,
      path: 'tenant-a/consent/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      metadata: {
        fileName: 'evidencia.pdf',
        contentType: 'application/pdf',
        size: 100,
      },
    });

    await expect(validate(upload)).resolves.toHaveLength(0);
    await expect(validate(completion)).resolves.toHaveLength(0);
  });

  it('rejects CONSENT in the private download flow', async () => {
    const download = plainToInstance(CreateDownloadUrlDto, {
      module: StorageModuleName.CONSENT,
      resourceId: 'consent-a',
    });

    await expect(validate(download)).resolves.not.toHaveLength(0);
  });
});
