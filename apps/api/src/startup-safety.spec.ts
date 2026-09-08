import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BillingModule } from './billing/billing.module';
import { BillingService } from './billing/billing.service';
import { NotificationsService } from './notifications/notifications.service';
import { RetentionService } from './retention/retention.service';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('application startup safety', () => {
  it('does not load unreleased background automation into AppModule', () => {
    const appModule = source('app.module.ts');

    expect(appModule).not.toMatch(/\bScheduleModule\b/u);
    expect(appModule).not.toMatch(/\bRetentionModule\b/u);
    expect(appModule).not.toMatch(/\bNotificationsModule\b/u);
    expect(appModule).not.toMatch(/\bTransitionHandoverModule\b/u);
  });

  it('does not expose cron metadata on retained manual operations', () => {
    expect(
      Reflect.getMetadata(
        'SCHEDULER_TYPE',
        RetentionService.prototype.handleDataRetention,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'SCHEDULER_TYPE',
        NotificationsService.prototype.sendTaskReminders,
      ),
    ).toBeUndefined();
    expect(RetentionService.prototype.handleDataRetention).toEqual(
      expect.any(Function),
    );
    expect(NotificationsService.prototype.sendTaskReminders).toEqual(
      expect.any(Function),
    );
  });

  it('does not mutate billing tables through a module lifecycle hook', () => {
    expect(Reflect.has(BillingModule.prototype, 'onModuleInit')).toBe(false);
    expect(BillingService.prototype.seedDefaultPlans).toEqual(
      expect.any(Function),
    );
  });

  it('enables Nest shutdown hooks for orchestrator termination signals', () => {
    const main = source('main.ts');

    expect(main).toMatch(/enableApplicationShutdownHooks\(app\)/u);
  });
});
