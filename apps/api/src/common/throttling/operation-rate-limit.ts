import { SetMetadata } from '@nestjs/common';

export const OPERATION_RATE_LIMIT_KEY = 'operation-rate-limit';

// Shared across IPs and module parameters. A batch still has its own row/size
// validation; these quotas bound repeated expensive requests before execution.
export const OPERATION_RATE_LIMITS = {
  'import-preview': { account: 12, tenant: 36, windowMs: 60_000 },
  'import-execute': { account: 6, tenant: 18, windowMs: 60_000 },
  export: { account: 6, tenant: 18, windowMs: 60_000 },
} as const;

export type RateLimitedOperation = keyof typeof OPERATION_RATE_LIMITS;

export const RateLimitOperation = (operation: RateLimitedOperation) =>
  SetMetadata(OPERATION_RATE_LIMIT_KEY, operation);
