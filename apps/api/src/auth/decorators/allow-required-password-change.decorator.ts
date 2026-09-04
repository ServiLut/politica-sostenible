import { SetMetadata } from '@nestjs/common';

export const ALLOW_REQUIRED_PASSWORD_CHANGE_KEY = 'allowRequiredPasswordChange';

/**
 * Allows an authenticated account with a temporary credential to reach only
 * the endpoints required to inspect its session and replace that credential.
 */
export const AllowRequiredPasswordChange = () =>
  SetMetadata(ALLOW_REQUIRED_PASSWORD_CHANGE_KEY, true);
