import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANY_AUTHENTICATED_KEY = 'allowAnyAuthenticated';

export const AllowAnyAuthenticatedRole = () =>
  SetMetadata(ALLOW_ANY_AUTHENTICATED_KEY, true);
