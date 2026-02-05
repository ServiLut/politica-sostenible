import { prisma } from '@/lib/prisma';
import { compare, hash } from 'bcryptjs';



const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_MINUTES = 30;

export class SensitiveAuthService {

  /**
   * Verifies the Security PIN for sensitive operational actions.
   * Enforces retry limits and temporary lockouts.
   */
  async verifySensitiveAction(userId: string, pin: string, actionName: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        pinHash: true, 
        pinAttempts: true, 
        pinLockedUntil: true 
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 1. Check Lockout
    if (user.pinLockedUntil && new Date() < user.pinLockedUntil) {
      const remainingTime = Math.ceil((user.pinLockedUntil.getTime() - new Date().getTime()) / 60000);
      await this.logAudit(user.id, actionName, 'BLOCKED_LOCKED', `Attempted while locked. Remaining: ${remainingTime}m`);
      throw new Error(`Security PIN is locked. Try again in ${remainingTime} minutes.`);
    }

    // 2. Check if PIN is set
    if (!user.pinHash) {
      await this.logAudit(user.id, actionName, 'BLOCKED_NO_PIN', 'PIN not configured');
      throw new Error('Security PIN not configured for this user.');
    }

    // 3. Verify PIN
    const isValid = await compare(pin, user.pinHash);

    if (isValid) {
      // Success: Reset counters
      await prisma.user.update({
        where: { id: userId },
        data: {
          pinAttempts: 0,
          pinLockedUntil: null
        }
      });
      
      await this.logAudit(user.id, actionName, 'SUCCESS', 'PIN Verified');
      return true;
    } else {
      // Failure: Increment attempts
      const newAttempts = (user.pinAttempts || 0) + 1;
      let lockDate: Date | null = null;

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        lockDate = new Date();
        lockDate.setMinutes(lockDate.getMinutes() + PIN_LOCKOUT_MINUTES);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          pinAttempts: newAttempts,
          pinLockedUntil: lockDate
        }
      });

      const failureReason = lockDate ? `LOCKED_MAX_ATTEMPTS` : `INVALID_PIN (${newAttempts}/${MAX_PIN_ATTEMPTS})`;
      await this.logAudit(user.id, actionName, 'FAILURE', failureReason);
      
      if (lockDate) {
        throw new Error(`Too many invalid attempts. Account locked for ${PIN_LOCKOUT_MINUTES} minutes.`);
      }
      
      throw new Error(`Invalid Security PIN. Attempts remaining: ${MAX_PIN_ATTEMPTS - newAttempts}`);
    }
  }

  /**
   * Protocolo de Salida (11.7)
   * Invalidates User access and wipes Security PIN.
   */
  async revokeActorAccess(userId: string, reason: string, adminId?: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    // Transactional revocation
    await prisma.$transaction(async (tx) => {
      // 1. Remove PIN and lock and Deactivate
      await tx.user.update({
        where: { id: userId },
        data: {
          pinHash: null,
          pinAttempts: 0,
          pinLockedUntil: null,
          isActive: false
        }
      });

      // 2. Kill active sensitive sessions
      await tx.sensitiveActionAuth.deleteMany({
        where: { userId: userId }
      });
    });

    // Log the revocation
    await prisma.auditLog.create({
      data: {
        action: 'PROTOCOL_EXIT_REVOCATION',
        entity: 'User',
        entityId: userId,
        userId: adminId, // Can be null if system
        details: { reason, targetUserId: userId }
      }
    });
  }

  /**
   * Helper to set a PIN (e.g. during setup)
   */
  async setSecurityPin(userId: string, plainPin: string): Promise<void> {
    const hashed = await hash(plainPin, 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        pinHash: hashed,
        pinAttempts: 0,
        pinLockedUntil: null
      }
    });
  }

  private async logAudit(userId: string, action: string, status: string, message: string) {
    await prisma.auditLog.create({
      data: {
        action: `SENSITIVE_AUTH_${status}`,
        entity: 'SensitiveAction',
        entityId: userId, 
        userId: userId,
        details: { 
          intent: action,
          message 
        }
      }
    });
  }
}

