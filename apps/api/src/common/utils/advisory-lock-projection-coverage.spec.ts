import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const SOURCE_ROOT = resolve('src');
const ADVISORY_LOCK_CALL = /pg_advisory_xact_lock\s*\(/gu;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (
      !entry.isFile() ||
      extname(entry.name) !== '.ts' ||
      entry.name.endsWith('.spec.ts')
    ) {
      return [];
    }
    return [path];
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

describe('PostgreSQL advisory-lock projection contract', () => {
  it('never exposes PostgreSQL void through Prisma queryRaw', () => {
    const violations: string[] = [];
    let inspectedLocks = 0;

    for (const file of productionTypeScriptFiles(SOURCE_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(ADVISORY_LOCK_CALL)) {
        inspectedLocks += 1;
        const index = match.index;
        const prefix = source.slice(Math.max(0, index - 500), index);
        const materialized = prefix.match(
          /WITH\s+([a-z][a-z0-9_]*)\s+AS\s+MATERIALIZED\s*\(\s*SELECT\s*$/iu,
        );
        if (!materialized) {
          violations.push(
            `${relative(SOURCE_ROOT, file)}:${source.slice(0, index).split('\n').length} does not acquire through a MATERIALIZED CTE`,
          );
          continue;
        }

        const cteName = materialized[1];
        const suffix = source.slice(index, index + 1_200);
        const supportedProjection = new RegExp(
          `pg_advisory_xact_lock\\s*\\([\\s\\S]*?\\)\\s*\\)\\s*SELECT\\s+TRUE\\s+AS\\s+"locked"\\s+FROM\\s+${escapeRegex(cteName)}`,
          'u',
        );
        if (!supportedProjection.test(suffix)) {
          violations.push(
            `${relative(SOURCE_ROOT, file)}:${source.slice(0, index).split('\n').length} does not project a supported boolean`,
          );
        }
      }
    }

    expect(inspectedLocks).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
