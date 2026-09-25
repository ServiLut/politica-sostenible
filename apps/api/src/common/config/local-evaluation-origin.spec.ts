import { isLocalEvaluationOrigin } from './local-evaluation-origin';

describe('isolated local evaluation origins', () => {
  const environment = {
    NODE_ENV: 'production',
    DEPLOYMENT_PROFILE: 'evaluation',
    ALLOW_LOCAL_STAGING_BUILD: 'true',
  };

  it('requires both explicit switches and a loopback origin', () => {
    const url = new URL('http://127.0.0.1:5800');
    expect(isLocalEvaluationOrigin(url, environment)).toBe(true);
    expect(isLocalEvaluationOrigin(url, {})).toBe(false);
    expect(
      isLocalEvaluationOrigin(url, {
        ...environment,
        DEPLOYMENT_PROFILE: 'production',
      }),
    ).toBe(false);
    expect(
      isLocalEvaluationOrigin(url, {
        ...environment,
        ALLOW_LOCAL_STAGING_BUILD: 'false',
      }),
    ).toBe(false);
  });

  it.each([
    'http://127.0.0.1.evil.invalid:5800',
    'http://192.168.1.10:5800',
    'https://project.supabase.co',
    'http://127.0.0.1:5800/storage/v1',
    'http://user:pass@127.0.0.1:5800',
    'http://127.0.0.1:5800?target=production',
  ])('rejects %s', (url) => {
    expect(isLocalEvaluationOrigin(new URL(url), environment)).toBe(false);
  });
});
