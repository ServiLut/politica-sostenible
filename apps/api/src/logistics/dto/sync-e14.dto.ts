import { Transform, type TransformFnParams } from 'class-transformer';
import { IsISO8601, IsUUID, Matches } from 'class-validator';
import { CreateWitnessReportDto } from '../../witness/dto/create-witness-report.dto';
import {
  OFFLINE_E14_GRANT_TOKEN_PATTERN,
  SHA256_HEX_PATTERN,
} from '../../witness/dto/offline-e14-capture-grant.dto';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Offline sync uses the exact same traceability contract as web reports. */
export class SyncE14Dto extends CreateWitnessReportDto {
  @Transform(trim)
  @IsUUID('all')
  clientOperationId: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: 'capturedAt debe incluir fecha, hora y zona horaria' },
  )
  capturedAt: string;

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
}
