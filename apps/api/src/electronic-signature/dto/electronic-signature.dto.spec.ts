import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SignatureParamsDto,
  SignDocumentDto,
  VerifySignatureQueryDto,
} from './electronic-signature.dto';
import { StorageModuleName } from '../../storage/storage.constants';

describe('Electronic signature DTO validation', () => {
  it('accepts safe identifiers and a six-digit OTP', async () => {
    const body = plainToInstance(SignDocumentDto, {
      documentId: 'document_safe-123',
      module: StorageModuleName.FINANCE,
      resourceId: 'finance_safe-123',
      otpCode: '123456',
    });
    const params = plainToInstance(SignatureParamsDto, {
      id: 'signature_safe-123',
    });
    const query = plainToInstance(VerifySignatureQueryDto, {
      module: StorageModuleName.E14,
      resourceId: 'report_safe-123',
    });

    await expect(validate(body)).resolves.toHaveLength(0);
    await expect(validate(params)).resolves.toHaveLength(0);
    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it('rejects path-like ids and malformed OTP values', async () => {
    const body = plainToInstance(SignDocumentDto, {
      documentId: '../tenant-b/document',
      module: 'documents',
      resourceId: '../tenant-b/resource',
      otpCode: '12345x',
    });
    const params = plainToInstance(SignatureParamsDto, { id: '../other' });
    const query = plainToInstance(VerifySignatureQueryDto, {
      module: 'finance',
      resourceId: '../other',
    });
    const unsupportedModule = plainToInstance(VerifySignatureQueryDto, {
      module: StorageModuleName.CONSENT,
      resourceId: 'consent-safe-123',
    });

    await expect(validate(body)).resolves.not.toHaveLength(0);
    await expect(validate(params)).resolves.not.toHaveLength(0);
    await expect(validate(query)).resolves.not.toHaveLength(0);
    await expect(validate(unsupportedModule)).resolves.not.toHaveLength(0);
  });
});
