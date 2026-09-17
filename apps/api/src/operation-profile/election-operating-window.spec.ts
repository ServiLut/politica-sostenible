import {
  dateOnlyFromKey,
  electionOperatingWindowSha256,
  getElectionOperatingWindowError,
  isWithinElectionOperatingWindow,
  normalizeElectionOperatingWindow,
  toBogotaDateKey,
} from './election-operating-window';

describe('election operating window', () => {
  it('defaults an omitted window to the declared civil election date', () => {
    expect(
      normalizeElectionOperatingWindow({
        electionDate: '2026-06-21',
      }),
    ).toMatchObject({
      electionDateKey: '2026-06-21',
      votingStartDateKey: '2026-06-21',
      votingEndDateKey: '2026-06-21',
      inclusiveDays: 1,
      votingWindowSourceUrl: null,
      votingWindowReference: null,
    });
  });

  it('accepts an inclusive fourteen-date window with documentary provenance', () => {
    expect(
      normalizeElectionOperatingWindow({
        electionDate: '2026-09-09T17:00:00.000Z',
        votingStartDate: '2026-09-01',
        votingEndDate: '2026-09-14',
        votingWindowSourceUrl: ' https://autoridad.example/resolucion/42.pdf ',
        votingWindowReference: ' Resolucion documentada 42 ',
      }),
    ).toMatchObject({
      inclusiveDays: 14,
      votingWindowSourceUrl: 'https://autoridad.example/resolucion/42.pdf',
      votingWindowReference: 'Resolucion documentada 42',
    });
  });

  it.each([
    [
      'one missing boundary',
      { votingStartDate: '2026-09-09' },
      'declararse juntos',
    ],
    [
      'official date outside window',
      { votingStartDate: '2026-09-10', votingEndDate: '2026-09-11' },
      'debe estar dentro',
    ],
    [
      'fifteen inclusive dates',
      { votingStartDate: '2026-09-01', votingEndDate: '2026-09-15' },
      'entre 1 y 14',
    ],
    [
      'multiday without provenance',
      { votingStartDate: '2026-09-08', votingEndDate: '2026-09-09' },
      'exige fuente HTTPS',
    ],
    [
      'insecure source',
      {
        votingStartDate: '2026-09-08',
        votingEndDate: '2026-09-09',
        votingWindowSourceUrl: 'http://authority.example/window',
        votingWindowReference: 'Acto documentado 42',
      },
      'debe usar HTTPS',
    ],
    [
      'credentialed source',
      {
        votingStartDate: '2026-09-08',
        votingEndDate: '2026-09-09',
        votingWindowSourceUrl: 'https://user:secret@authority.example/window',
        votingWindowReference: 'Acto documentado 42',
      },
      'credenciales',
    ],
  ])('rejects %s', (_label, patch, message) => {
    expect(
      getElectionOperatingWindowError({
        electionDate: '2026-09-09T17:00:00.000Z',
        ...patch,
      }),
    ).toContain(message);
  });

  it('resolves Bogota midnight and evaluates inclusive boundaries', () => {
    expect(toBogotaDateKey(new Date('2026-09-10T04:59:59.999Z'))).toBe(
      '2026-09-09',
    );
    expect(toBogotaDateKey(new Date('2026-09-10T05:00:00.000Z'))).toBe(
      '2026-09-10',
    );
    const start = dateOnlyFromKey('2026-09-09');
    const end = dateOnlyFromKey('2026-09-10');
    expect(
      isWithinElectionOperatingWindow(
        new Date('2026-09-09T05:00:00.000Z'),
        start,
        end,
      ),
    ).toBe(true);
    expect(
      isWithinElectionOperatingWindow(
        new Date('2026-09-11T04:59:59.999Z'),
        start,
        end,
      ),
    ).toBe(true);
    expect(
      isWithinElectionOperatingWindow(
        new Date('2026-09-11T05:00:00.000Z'),
        start,
        end,
      ),
    ).toBe(false);
  });

  it('binds tenant, profile, dates and documentary source to one stable SHA-256', () => {
    const base = {
      tenantId: 'tenant-a',
      operationProfileId: 'profile-a',
      electionDate: new Date('2026-09-09T17:00:00.000Z'),
      votingStartDate: dateOnlyFromKey('2026-09-08'),
      votingEndDate: dateOnlyFromKey('2026-09-09'),
      votingWindowSourceUrl: 'https://authority.example/window.pdf',
      votingWindowReference: 'Acto documentado 42',
    };
    const digest = electionOperatingWindowSha256(base);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(electionOperatingWindowSha256({ ...base })).toBe(digest);
    expect(
      electionOperatingWindowSha256({
        ...base,
        votingWindowReference: 'Acto documentado 43',
      }),
    ).not.toBe(digest);
    expect(
      electionOperatingWindowSha256({ ...base, tenantId: 'tenant-b' }),
    ).not.toBe(digest);
  });
});
