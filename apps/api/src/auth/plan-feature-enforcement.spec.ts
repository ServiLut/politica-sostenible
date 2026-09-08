import 'reflect-metadata';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verifySync: jest.fn(),
}));

import {
  PLAN_FEATURE_KEY,
  PlanFeature,
} from './decorators/requires-plan-feature.decorator';
import { ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY } from './decorators/allow-saas-admin-mfa-enrollment.decorator';
import { AuthController } from './auth.controller';
import { ElectronicSignatureController } from '../electronic-signature/electronic-signature.controller';
import { ExportController } from '../export/export.controller';
import { ImportController } from '../import/import.controller';

describe('plan feature route metadata', () => {
  it('protects every export and import route at controller scope', () => {
    expect(Reflect.getMetadata(PLAN_FEATURE_KEY, ExportController)).toBe(
      PlanFeature.EXPORT,
    );
    expect(Reflect.getMetadata(PLAN_FEATURE_KEY, ImportController)).toBe(
      PlanFeature.IMPORT,
    );
  });

  it('requires the MFA feature to enroll and verify MFA', () => {
    expect(
      Reflect.getMetadata(PLAN_FEATURE_KEY, AuthController.prototype.setupMfa),
    ).toBe(PlanFeature.MFA);
    expect(
      Reflect.getMetadata(PLAN_FEATURE_KEY, AuthController.prototype.verifyMfa),
    ).toBe(PlanFeature.MFA);
    expect(
      Reflect.getMetadata(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        AuthController.prototype.setupMfa,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        AuthController.prototype.verifyMfa,
      ),
    ).toBe(true);
  });

  it('keeps MFA disable/status available after a plan downgrade', () => {
    expect(
      Reflect.getMetadata(
        PLAN_FEATURE_KEY,
        AuthController.prototype.disableMfa,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(PLAN_FEATURE_KEY, AuthController.prototype.mfaStatus),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        AuthController.prototype.disableMfa,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        AuthController.prototype.mfaStatus,
      ),
    ).toBeUndefined();
  });

  it('requires the MFA entitlement for signing but not for verification', () => {
    expect(
      Reflect.getMetadata(
        PLAN_FEATURE_KEY,
        ElectronicSignatureController.prototype.signDocument,
      ),
    ).toBe(PlanFeature.MFA);
    expect(
      Reflect.getMetadata(
        PLAN_FEATURE_KEY,
        ElectronicSignatureController.prototype.verifySignature,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        ElectronicSignatureController.prototype.signDocument,
      ),
    ).toBeUndefined();
  });
});
