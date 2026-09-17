import { RetentionService } from './retention.service';

describe('legacy RetentionService safety shell', () => {
  it('fails closed and cannot receive a database dependency', () => {
    const service = new RetentionService();

    expect(() => service.handleDataRetention('tenant-a')).toThrow(
      'La purga automatica esta deshabilitada',
    );
    expect(RetentionService.length).toBe(0);
  });

  it('contains no legacy destructive ORM entrypoint', () => {
    const source = RetentionService.prototype.handleDataRetention.toString();

    expect(source).not.toMatch(/deleteMany|updateMany|\$transaction/u);
    expect(source).toMatch(/AUTOMATED_RETENTION_DISABLED/u);
  });
});
