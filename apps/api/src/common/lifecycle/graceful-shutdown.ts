import { INestApplication, ShutdownSignal } from '@nestjs/common';

export const APPLICATION_SHUTDOWN_SIGNALS = Object.freeze([
  ShutdownSignal.SIGTERM,
  ShutdownSignal.SIGINT,
]);

export function enableApplicationShutdownHooks(
  application: Pick<INestApplication, 'enableShutdownHooks'>,
): void {
  application.enableShutdownHooks([...APPLICATION_SHUTDOWN_SIGNALS], {
    useProcessExit: true,
  });
}
