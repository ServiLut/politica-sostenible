/** Opt-in used only by the isolated local evaluation topology. */
export function isLocalEvaluationOrigin(
  value: URL,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.DEPLOYMENT_PROFILE === 'evaluation' &&
    environment.ALLOW_LOCAL_STAGING_BUILD === 'true' &&
    ['127.0.0.1', '[::1]'].includes(value.hostname) &&
    ['http:', 'https:'].includes(value.protocol) &&
    value.pathname === '/' &&
    !value.username &&
    !value.password &&
    !value.search &&
    !value.hash
  );
}
