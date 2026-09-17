import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REAL_E14_CONSUMERS = [
  '../election-day/election-day.service.ts',
  '../campaign/campaign.service.ts',
  '../command-center/command-center.service.ts',
  '../operation-profile/operation-profile.service.ts',
  '../transition-handover/transition-handover.service.ts',
] as const;

describe('real E-14 consumer isolation', () => {
  it.each(REAL_E14_CONSUMERS)(
    'requires REAL on every WitnessReport query in %s',
    (relativePath) => {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
      const callPattern =
        /witnessReport\.(?:findMany|findFirst|count|groupBy|aggregate)\s*\(\s*\{/g;
      const calls = [...source.matchAll(callPattern)];

      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const callWindow = source.slice(call.index, call.index + 900);
        expect(callWindow).toContain(
          'captureContext: WitnessCaptureContext.REAL',
        );
      }
    },
  );

  it('does not accept capture context from web or offline DTOs', () => {
    for (const dtoPath of [
      './dto/create-witness-report.dto.ts',
      '../logistics/dto/sync-e14.dto.ts',
    ]) {
      const source = readFileSync(resolve(__dirname, dtoPath), 'utf8');
      expect(source).not.toContain('captureContext');
      expect(source).not.toContain('WitnessCaptureContext');
    }
  });
});
