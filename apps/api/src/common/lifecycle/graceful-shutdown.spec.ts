import { INestApplication, ShutdownSignal } from '@nestjs/common';
import {
  APPLICATION_SHUTDOWN_SIGNALS,
  enableApplicationShutdownHooks,
} from './graceful-shutdown';

describe('enableApplicationShutdownHooks', () => {
  it('registers the orchestrator termination signals on Nest', () => {
    const enableShutdownHooks = jest.fn();
    const application = {
      enableShutdownHooks,
    } as unknown as Pick<INestApplication, 'enableShutdownHooks'>;

    enableApplicationShutdownHooks(application);

    expect(APPLICATION_SHUTDOWN_SIGNALS).toEqual([
      ShutdownSignal.SIGTERM,
      ShutdownSignal.SIGINT,
    ]);
    expect(enableShutdownHooks).toHaveBeenCalledWith(
      [ShutdownSignal.SIGTERM, ShutdownSignal.SIGINT],
      { useProcessExit: true },
    );
  });
});
