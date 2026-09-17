export const PUBLIC_REGISTRATION_CLOSED_MESSAGE =
  'El registro publico esta cerrado. Solicita una invitacion a la administracion de la plataforma.';

/**
 * Fuente autoritativa del contrato legal aceptado al crear una organizacion.
 * El frontend obtiene este valor exclusivamente desde registration-policy.
 */
export const PUBLIC_REGISTRATION_TERMS_VERSION = '2026.1';

export type PublicRegistrationMode = 'SELF_SERVICE' | 'CONTROLLED_ACCESS';

export interface PublicRegistrationPolicy {
  enabled: boolean;
  invitationAcceptanceEnabled: boolean;
  mode: PublicRegistrationMode;
  message: string;
  termsVersion: string;
}

/**
 * Production is deliberately fail-closed. Development and test environments
 * remain usable unless an operator explicitly disables public registration.
 */
export function resolvePublicRegistrationPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): PublicRegistrationPolicy {
  const configured =
    environment.PUBLIC_REGISTRATION_ENABLED?.trim().toLowerCase();
  const enabled =
    environment.NODE_ENV === 'production'
      ? configured === 'true'
      : configured !== 'false';
  const invitationConfigured =
    environment.TEAM_INVITATION_ACCEPTANCE_ENABLED?.trim().toLowerCase();
  const invitationAcceptanceEnabled =
    invitationConfigured === undefined || invitationConfigured === 'true';

  return enabled
    ? {
        enabled: true,
        invitationAcceptanceEnabled,
        mode: 'SELF_SERVICE',
        message: 'El registro publico de organizaciones esta habilitado.',
        termsVersion: PUBLIC_REGISTRATION_TERMS_VERSION,
      }
    : {
        enabled: false,
        invitationAcceptanceEnabled,
        mode: 'CONTROLLED_ACCESS',
        message: PUBLIC_REGISTRATION_CLOSED_MESSAGE,
        termsVersion: PUBLIC_REGISTRATION_TERMS_VERSION,
      };
}
