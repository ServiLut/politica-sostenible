import { prisma } from '@/lib/prisma';
import { createHash, randomBytes } from 'crypto';



interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

interface WatermarkStyle {
  className: string;
  style: Record<string, string>;
  renderHash: string;
}

export class ForensicService {

  // ===========================================================================
  // 1. BITÁCORA CENTRAL (Immutable / Append-Only)
  // ===========================================================================

  /**
   * Registra un evento en la bitácora inmutable.
   * NO EXISTEN métodos de 'update' o 'delete' en este servicio intencionalmente.
   */
  async logAction(
    actorId: string, // UserId
    action: string,
    resource: string,
    resourceId: string | undefined,
    result: 'SUCCESS' | 'FAILURE',
    context: AuditContext,
    details?: object
  ): Promise<void> {
    
    // We assume actorId is the userId as per current Schema V4.2
    await prisma.auditLog.create({
      data: {
        action: action,
        entity: resource,
        entityId: resourceId,
        userId: actorId,
        details: {
          ...details,
          result,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      }
    });
  }

  // ===========================================================================
  // 2. MARCAS DE AGUA UI (Steganography in CSS)
  // ===========================================================================

  /**
   * Genera una firma visual única e imperceptible para la sesión actual.
   * Se debe inyectar en el contenedor principal del Layout.
   */
  generateUIWatermark(sessionId: string, userId: string): WatermarkStyle {
    // 1. Create a deterministic hash based on session + day (rotates daily)
    const today = new Date().toISOString().split('T')[0];
    const rawString = `${userId}-${sessionId}-${today}-${process.env.FORENSIC_SECRET || 'secret'}`;
    const hash = createHash('sha256').update(rawString).digest('hex');

    // 2. Derive distinct micro-variations from the hash
    // We take segments of the hash to drive CSS values
    
    // Color variation: tiny shift from pure black/white
    // Hex: #000000 -> #010001 (Imperceptible on most screens)
    // We use the first 6 chars but verify they are low values to keep it subtle
    const r = parseInt(hash.substring(0, 2), 16) % 3; // 0, 1, 2
    const g = parseInt(hash.substring(2, 4), 16) % 2; // 0, 1
    const b = parseInt(hash.substring(4, 6), 16) % 3; // 0, 1, 2
    const colorOffset = `#0${r}0${g}0${b}`; 

    // Letter Spacing: 0.0001px to 0.0009px
    const spacingVal = parseInt(hash.substring(6, 7), 16) % 9;
    const letterSpacing = `0.000${spacingVal}px`;

    // Container Width: 99.99% vs 100%
    // Only applied to a wrapper div
    const widthVal = parseInt(hash.substring(7, 8), 16) % 5; // 0-4
    const width = `99.99${widthVal}%`;

    return {
      renderHash: hash,
      className: `s-${hash.substring(0, 8)}`, // Obfuscated class name
      style: {
        color: colorOffset, // Forces text to be NOT perfectly black
        letterSpacing: letterSpacing,
        maxWidth: width,
        // Use a CSS variable that holds the ID strictly for DOM inspection if needed
        '--f-trace': `"${hash.substring(0, 12)}"` 
      }
    };
  }

  // ===========================================================================
  // 3. TRAMPAS CANARIO (Export Interceptor)
  // ===========================================================================

  /**
   * Intercepts a data array intended for export and injects a "Canary" row.
   * This row contains unique, traceable IDs hidden in plain sight.
   */
  async injectCanaryInExport<T extends object>(
    actorId: string, 
    data: T[], 
    entityType: 'CONTACTS' | 'FINANCE',
    context: AuditContext
  ): Promise<T[]> {
    
    // 1. Generate Canary ID
    const canaryId = randomBytes(8).toString('hex');
    const canaryToken = `REF-${canaryId.toUpperCase()}`;

    // 2. Create Decoy Data based on Entity Type
    let decoyRow: any = {};

    if (entityType === 'CONTACTS') {
      decoyRow = {
        firstName: 'System', 
        lastName: 'Audit',
        // Inyectamos el token en un campo visible pero "aburrido" o en metadatos
        notes: `Internal Reference: ${canaryToken}`, 
        phone: '0000000000',
        email: `audit.${canaryId}@internal.check`
      };
    } else if (entityType === 'FINANCE') {
      decoyRow = {
        description: `Correction adjustment ${canaryToken}`,
        amount: 0.01, // Negligible amount
        date: new Date(),
        reference: canaryToken
      };
    } else {
      // Fallback generic
      decoyRow = {
        id: canaryToken,
        _trace: 'CONFIDENTIAL'
      };
    }

    // 3. Log the Canary creation immediately (using AuditLog as ExportAudit doesn't exist)
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'EXPORT_CANARY_CREATED',
        entity: entityType,
        exportCanaryId: canaryToken,
        details: {
            exportType: 'UNKNOWN',
            canaryData: decoyRow,
            ipAddress: context.ipAddress
        }
      }
    });

    // 4. Inject at random position (middle or end to avoid detection at top)
    const position = Math.floor(Math.random() * (data.length - 1)) + 1;
    const newData = [...data];
    newData.splice(position, 0, decoyRow as T);

    return newData;
  }
}
