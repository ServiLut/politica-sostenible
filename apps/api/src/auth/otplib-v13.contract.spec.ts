import { execFileSync } from 'node:child_process';

function runOtplibContract(assertion: string): string {
  return execFileSync(process.execPath, ['-e', assertion], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
}

describe('otplib v13 replay contract', () => {
  it('returns timeStep and rejects reuse through afterTimeStep', () => {
    const result = runOtplibContract(`
      const { generateSecret, generateSync, verifySync } = require('otplib');
      const epoch = 1800000000;
      const secret = generateSecret();
      const token = generateSync({ strategy: 'totp', secret, epoch });
      const first = verifySync({ strategy: 'totp', secret, token, epoch });
      if (!first.valid || !Number.isInteger(first.timeStep)) process.exit(2);
      const replay = verifySync({
        strategy: 'totp', secret, token, epoch, afterTimeStep: first.timeStep,
      });
      if (replay.valid) process.exit(3);
      process.stdout.write('replay-rejected');
    `);

    expect(result).toBe('replay-rejected');
  });

  it('identifies an impossible future afterTimeStep', () => {
    const result = runOtplibContract(`
      const { generateSecret, generateSync, verifySync } = require('otplib');
      const epoch = 1800000000;
      const secret = generateSecret();
      const token = generateSync({ strategy: 'totp', secret, epoch });
      const current = verifySync({ strategy: 'totp', secret, token, epoch });
      if (!current.valid) process.exit(2);
      try {
        verifySync({
          strategy: 'totp', secret, token, epoch,
          afterTimeStep: current.timeStep + 100,
        });
        process.exit(3);
      } catch (error) {
        if (error.name !== 'AfterTimeStepRangeExceededError') process.exit(4);
      }
      process.stdout.write('range-error-classified');
    `);

    expect(result).toBe('range-error-classified');
  });
});
