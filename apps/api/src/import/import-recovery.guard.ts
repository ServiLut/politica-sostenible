import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Only the schema-45 fallback image contains this guard. No client override. */
@Injectable()
export class ImportRecoveryGuard implements CanActivate {
  canActivate(): never {
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'IMPORT_SUSPENDED_FOR_RECOVERY',
      message:
        'La importación de personas está suspendida durante la recuperación del servicio. Los trabajos y archivos conservados se retomarán al restablecer la versión compatible; no vuelvas a cargar el mismo archivo.',
    });
  }
}
