const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;

/**
 * Never reflects arbitrary environment input into an HTTP header. Production
 * startup separately requires the full SHA; development remains explicit.
 */
export function resolveAppRevision(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const revision = environment.APP_REVISION?.trim() ?? '';
  return FULL_GIT_SHA.test(revision) ? revision.toLowerCase() : 'unknown';
}
