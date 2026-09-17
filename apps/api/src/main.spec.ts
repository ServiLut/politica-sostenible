import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppRevision } from './common/http/app-revision';

describe('runtime revision evidence', () => {
  it('publishes only a full immutable Git SHA', () => {
    expect(
      resolveAppRevision({ APP_REVISION: 'A'.repeat(40) } as NodeJS.ProcessEnv),
    ).toBe('a'.repeat(40));
    expect(
      resolveAppRevision({ APP_REVISION: 'main' } as NodeJS.ProcessEnv),
    ).toBe('unknown');
    expect(resolveAppRevision({} as NodeJS.ProcessEnv)).toBe('unknown');
  });

  it('exposes the same revision header through API responses and CORS', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toContain("res.setHeader('X-App-Revision', appRevision)");
    expect(source).toContain("'X-Request-Id', 'X-App-Revision'");
  });
});
