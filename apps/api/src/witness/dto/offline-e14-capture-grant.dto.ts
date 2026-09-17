import { Transform, type TransformFnParams } from 'class-transformer';
import { IsISO8601, Matches } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const OFFLINE_E14_GRANT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export class OfflineE14GrantProofDto {
  @Transform(trim)
  @Matches(OFFLINE_E14_GRANT_TOKEN_PATTERN, {
    message: 'captureGrant no cumple el formato de capacidad opaca',
  })
  captureGrant: string;

  @Transform(trim)
  @Matches(SHA256_HEX_PATTERN, {
    message: 'evidenceSha256 debe ser una huella SHA-256 hexadecimal',
  })
  evidenceSha256: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  capturedAt: string;
}
