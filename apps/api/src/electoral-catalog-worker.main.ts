import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ElectoralCatalogWorkerModule } from './electoral-catalog-worker.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(
    ElectoralCatalogWorkerModule,
    { bufferLogs: true },
  );
  application.enableShutdownHooks();
  Logger.log(
    'Worker de ingesta electoral e integridad de Storage listo',
    'Bootstrap',
  );
}

void bootstrap().catch(() => {
  // El orquestador necesita un fallo de proceso, no un worker vivo a medias.
  // Los detalles de configuracion/secretos permanecen fuera de este log.
  Logger.error(
    'El worker de ingesta electoral e integridad de Storage no pudo iniciar',
    'Bootstrap',
  );
  process.exitCode = 1;
});
