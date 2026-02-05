import { prisma } from '@/lib/prisma';
import {  User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { SignJWT } from 'jose'; // Standard for Next.js Edge/Server compatibility
import { auditService } from './audit.service';


const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev_secret_key_change_me');
const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

export class AuthService {

  /**
   * Genera un JWT estándar para la sesión (Capa 1)
   */
  async login(userId: string, email: string, role: string) {
    const token = await new SignJWT({ sub: userId, email, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(JWT_SECRET);
    
    return token;
  }

  /**
   * Valida el PIN de Seguridad (Capa 2)
   * Maneja: Verificación de hash, Conteo de intentos y Bloqueo temporal.
   */
  async validateSecurityPin(userId: string, plainPin: string, actionContext: string, ip?: string): Promise<boolean> {
    
    // 1. Obtener usuario y estado de seguridad
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, pinHash: true, pinAttempts: true, pinLockedUntil: true }
    });

    if (!user) throw new Error('User not found');

    // 2. Verificar Bloqueo Activo
    if (user.pinLockedUntil && new Date() < user.pinLockedUntil) {
      const remainingInfo = `Locked until ${user.pinLockedUntil.toISOString()}`;
      await auditService.logSecurityEvent(userId, 'PIN_VALIDATION', actionContext, undefined, 'BLOCKED', { reason: 'Account Locked', ip });
      throw new Error(`SECURITY_LOCKOUT: Account is locked. Try again after 15 minutes.`);
    }

    // 3. Verificar Existencia de PIN
    if (!user.pinHash) {
      throw new Error('SETUP_REQUIRED: Security PIN not configured.');
    }

    // 4. Validar Longitud (Constraint 4-6)
    if (!/^\d{4,6}$/.test(plainPin)) {
      throw new Error('INVALID_FORMAT: PIN must be 4-6 digits.');
    }

    // 5. Comparar Hash
    const isValid = await compare(plainPin, user.pinHash);

    if (isValid) {
      // ÉXITO: Resetear contadores si tenía intentos previos
      if (user.pinAttempts > 0 || user.pinLockedUntil) {
        await prisma.user.update({
          where: { id: userId },
          data: { pinAttempts: 0, pinLockedUntil: null }
        });
      }
      
      await auditService.logSecurityEvent(userId, 'PIN_VALIDATION', actionContext, undefined, 'SUCCESS', { ip });
      return true;

    } else {
      // FALLO: Incrementar contadores y evaluar bloqueo
      const newAttempts = user.pinAttempts + 1;
      let lockDate: Date | null = null;

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        lockDate = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          pinAttempts: newAttempts,
          pinLockedUntil: lockDate
        }
      });

      const status = lockDate ? 'BLOCKED' : 'FAILURE';
      const reason = lockDate ? 'Max attempts reached' : `Invalid PIN. Attempt ${newAttempts}/${MAX_PIN_ATTEMPTS}`;
      
      await auditService.logSecurityEvent(userId, 'PIN_VALIDATION', actionContext, undefined, status, { reason, ip });
      
      if (lockDate) {
        throw new Error(`SECURITY_ALERT: Too many failed attempts. Locked for ${LOCKOUT_MINUTES} minutes.`);
      }

      throw new Error('Invalid Security PIN.');
    }
  }

  /**
   * Helper para establecer/cambiar PIN
   */
  async setSecurityPin(userId: string, newPin: string) {
    if (!/^\d{4,6}$/.test(newPin)) throw new Error('PIN must be 4-6 digits');
    
    const hashed = await hash(newPin, 10);
    
    await prisma.user.update({
      where: { id: userId },
      data: { 
        pinHash: hashed,
        pinAttempts: 0,
        pinLockedUntil: null
      }
    });

    await auditService.logSecurityEvent(userId, 'PIN_UPDATE', 'UserProfile', userId, 'SUCCESS');
  }
}

export const authService = new AuthService();

