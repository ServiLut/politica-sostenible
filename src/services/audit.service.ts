import { prisma } from '@/lib/prisma';



export class AuditService {
  /**
   * Registra un evento de seguridad de manera inalterable.
   * Se enfoca en el uso del PIN y cambios de estado críticos.
   */
  async logSecurityEvent(
    userId: string,
    action: string, // Ej: 'SENSITIVE_ACTION_ATTEMPT', 'PIN_LOCKED'
    resource: string,
    resourceId: string | undefined,
    status: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
    metadata?: {
      ip?: string;
      userAgent?: string;
      reason?: string;
      path?: string;
    }
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          entity: resource,
          entityId: resourceId,
          details: {
            status,
            ...metadata
          },
          // timestamp se llena automáticamente con @default(now())
        },
      });
    } catch (error) {
      // Fallback crítico: Si falla la auditoría, deberíamos alertar a la consola
      // pero no necesariamente detener el flujo si la operación fue válida,
      // aunque en sistemas estrictos, fallo de auditoría = fallo de operación.
      console.error('CRITICAL: Audit Log Failure', error);
    }
  }
}

export const auditService = new AuditService();

