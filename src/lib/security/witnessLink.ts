import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

type AllowedMethod = 'POST' | 'GET' | 'PUT';

interface LinkContext {
  resourceId: string;
  action: string;
  actorId?: string; // Optional: specific actor context
}

/**
 * Service to manage "Secure Public Links" for operational actions.
 * Enforces:
 * 1. Digital Signature (HMAC)
 * 2. Expiration (Time-based)
 * 3. Method Restriction (e.g., Only POST for uploads)
 */
export class SecureLinkManager {
  private readonly SECRET_KEY = process.env.WITNESS_LINK_SECRET || 'change-this-in-prod-securely-and-rotate';

  /**
   * Generates a signed, time-limited public link token.
   * 
   * @param action The specific capability (e.g., 'UPLOAD_E14', 'RSVP_CONFIRM')
   * @param resourceId The ID of the target resource (e.g., PollingTable ID, Event ID)
   * @param expiresInMinutes Duration of validity
   * @param restrictedMethod The ONLY HTTP method allowed (default POST for safety)
   */
  generateSecureToken(
    action: string, 
    resourceId: string, 
    expiresInMinutes: number = 60,
    restrictedMethod: AllowedMethod = 'POST',
    actorId: string = 'ANONYMOUS'
  ): string {
    const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);
    const salt = randomBytes(4).toString('hex'); // Random salt to ensure uniqueness even for same params

    // Payload structure: action|resourceId|expiresAt|method|actorId|salt
    const payload = `${action}|${resourceId}|${expiresAt}|${restrictedMethod}|${actorId}|${salt}`;
    const payloadEncoded = Buffer.from(payload).toString('base64url');
    
    const signature = this.sign(payloadEncoded);

    return `${payloadEncoded}.${signature}`;
  }

  /**
   * Verifies a token and returns its context if valid.
   * Throws errors for specific security failures (Expired, Tampered, Wrong Method).
   */
  verifySecureToken(token: string, currentMethod: string): LinkContext {
    const [payloadEncoded, signature] = token.split('.');

    if (!payloadEncoded || !signature) {
      throw new Error('INVALID_TOKEN_FORMAT');
    }

    // 1. Integrity Check (HMAC)
    const expectedSignature = this.sign(payloadEncoded);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      throw new Error('TOKEN_TAMPERED');
    }

    // 2. Decode & Parse
    const payload = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
    const [action, resourceId, expiresAtStr, restrictedMethod, actorId] = payload.split('|');

    // 3. Expiration Check
    if (Date.now() > parseInt(expiresAtStr)) {
      throw new Error('TOKEN_EXPIRED');
    }

    // 4. Method Restriction (Critical for V4.2 "Only Upload")
    if (currentMethod.toUpperCase() !== restrictedMethod.toUpperCase()) {
      throw new Error(`METHOD_NOT_ALLOWED: This link only supports ${restrictedMethod}`);
    }

    return { action, resourceId, actorId: actorId === 'ANONYMOUS' ? undefined : actorId };
  }

  /**
   * Utility to extract expiration date without verifying signature 
   * (Useful for UI "Link expires in X mins" display)
   */
  peekExpiration(token: string): Date | null {
    try {
      const [payloadEncoded] = token.split('.');
      const payload = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
      const parts = payload.split('|');
      return new Date(parseInt(parts[2]));
    } catch {
      return null;
    }
  }

  private sign(data: string): string {
    return createHmac('sha256', this.SECRET_KEY)
      .update(data)
      .digest('base64url');
  }
}