import {
  PUBLIC_REGISTRATION_CLOSED_MESSAGE,
  PUBLIC_REGISTRATION_TERMS_VERSION,
  resolvePublicRegistrationPolicy,
} from './public-registration.policy';

describe('public registration policy', () => {
  it('fails closed in production when the operator did not opt in', () => {
    expect(resolvePublicRegistrationPolicy({ NODE_ENV: 'production' })).toEqual(
      {
        enabled: false,
        invitationAcceptanceEnabled: true,
        mode: 'CONTROLLED_ACCESS',
        message: PUBLIC_REGISTRATION_CLOSED_MESSAGE,
        termsVersion: PUBLIC_REGISTRATION_TERMS_VERSION,
      },
    );
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'production',
        PUBLIC_REGISTRATION_ENABLED: 'false',
      }).enabled,
    ).toBe(false);
  });

  it('only opens production through an explicit true flag', () => {
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'production',
        PUBLIC_REGISTRATION_ENABLED: 'true',
      }),
    ).toMatchObject({
      enabled: true,
      invitationAcceptanceEnabled: true,
      mode: 'SELF_SERVICE',
      termsVersion: PUBLIC_REGISTRATION_TERMS_VERSION,
    });
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'production',
        PUBLIC_REGISTRATION_ENABLED: 'yes',
      }).enabled,
    ).toBe(false);
  });

  it('keeps local development usable and allows an explicit local closure', () => {
    expect(resolvePublicRegistrationPolicy({ NODE_ENV: 'test' }).enabled).toBe(
      true,
    );
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'development',
        PUBLIC_REGISTRATION_ENABLED: 'false',
      }).enabled,
    ).toBe(false);
  });

  it('keeps controlled invitations independent and allows an explicit emergency closure', () => {
    expect(
      resolvePublicRegistrationPolicy({ NODE_ENV: 'production' }),
    ).toMatchObject({
      enabled: false,
      invitationAcceptanceEnabled: true,
      mode: 'CONTROLLED_ACCESS',
    });
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'production',
        TEAM_INVITATION_ACCEPTANCE_ENABLED: 'false',
      }).invitationAcceptanceEnabled,
    ).toBe(false);
    expect(
      resolvePublicRegistrationPolicy({
        NODE_ENV: 'production',
        TEAM_INVITATION_ACCEPTANCE_ENABLED: 'yes',
      }).invitationAcceptanceEnabled,
    ).toBe(false);
  });
});
