interface LocalEvaluationEnvironment {
  DEPLOYMENT_PROFILE?: string;
  ALLOW_LOCAL_STAGING_BUILD?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

/** The explicit disposable evaluation profile may use HTTP only on loopback. */
export function allowsLocalEvaluationHttp(
  environment: LocalEvaluationEnvironment = {
    DEPLOYMENT_PROFILE: process.env.DEPLOYMENT_PROFILE,
    ALLOW_LOCAL_STAGING_BUILD: process.env.ALLOW_LOCAL_STAGING_BUILD,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
): boolean {
  if (
    environment.DEPLOYMENT_PROFILE !== "evaluation" ||
    environment.ALLOW_LOCAL_STAGING_BUILD !== "true"
  )
    return false;

  try {
    const url = new URL(environment.NEXT_PUBLIC_APP_URL ?? "");
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
