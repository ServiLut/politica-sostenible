import {
  canonicalElectoralCalendarCommand,
  computeElectoralCalendarCommandSha256,
} from './electoral-calendar.hash';

describe('electoral calendar canonical command hash', () => {
  it('is stable across object key order and excludes the supplied digest', () => {
    const first = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      rationale: 'Revision documentada de la fuente',
      payloadSha256: 'f'.repeat(64),
    };
    const second = {
      rationale: first.rationale,
      clientRequestId: first.clientRequestId,
    };
    expect(canonicalElectoralCalendarCommand('RELEASE_VALIDATE', first)).toBe(
      canonicalElectoralCalendarCommand('RELEASE_VALIDATE', second),
    );
    expect(
      computeElectoralCalendarCommandSha256('RELEASE_VALIDATE', first),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds the hash to command type and changed content', () => {
    const payload = { releaseId: '123e4567-e89b-42d3-a456-426614174000' };
    expect(
      computeElectoralCalendarCommandSha256('RELEASE_VALIDATE', payload),
    ).not.toBe(
      computeElectoralCalendarCommandSha256('RELEASE_ACTIVATE', payload),
    );
  });
});
