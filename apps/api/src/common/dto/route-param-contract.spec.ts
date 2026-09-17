import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function listControllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listControllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('Nest route parameter validation contract', () => {
  it('does not let named raw-string parameters bypass DTO validation', () => {
    const sourceRoot = join(__dirname, '..', '..');
    const offenders = listControllerFiles(sourceRoot)
      .filter((path) => /@Param\(\s*['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(sourceRoot.length + 1).replaceAll('\\', '/'));

    expect(offenders).toEqual([]);
  });
});
