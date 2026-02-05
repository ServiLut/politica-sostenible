import { prisma } from '@/lib/prisma';

/**
 * CHECK GLOBAL SYSTEM LOCK
 * Checks if the Organization is under Emergency Lock.
 */
export async function ensureSystemNotLocked() {
    const org = await prisma.organization.findFirst({ select: { isEmergencyLocked: true } });
    if (org?.isEmergencyLocked) {
        throw new Error("⛔ SISTEMA BLOQUEADO POR EMERGENCIA. Contacte al Administrador.");
    }
}

/**
 * GUARDIA DE CIERRE (Protocolo Forense)
 * Verifica si existe una elección activa y abierta.
 * Si el estado es 'CLOSED' o no hay elección activa, lanza una excepción que bloquea la escritura.
 */
export async function ensureElectionIsOpen() {
  // 1. Check Global Lock First
  await ensureSystemNotLocked();

  const election = await prisma.election.findFirst({
    where: { status: { in: ['ACTIVE', 'CLOSED'] } }, // Check active or closed to determine state
    orderBy: { createdAt: 'desc' }
  });

  // If no election context exists at all, usually we might allow setup, 
  // but strictly speaking if "Election Close" protocol is mentioned, we assume an election life-cycle.
  // However, usually we want to block if explicitly CLOSED.
  
  if (election && election.status === 'CLOSED') {
      throw new Error("⛔ LA ELECCIÓN ESTÁ CERRADA. Operación rechazada por protocolo forense.");
  }
  
  // Optionally: If strictly no active election is found, should we block?
  // The prompt says: "Si NO hay elección activa o si status === 'CLOSED'".
  // So if election is null, we might consider it "No active election" -> Block?
  // Or "Draft"?
  // Let's verify the prompt exact wording: "Si NO hay elección activa o si status === 'CLOSED'".
  
  // Refined Logic:
  // Find the "Current" election.
  const activeOrClosed = await prisma.election.findFirst({
      where: { status: { in: ['ACTIVE', 'CLOSED'] } },
      orderBy: { createdAt: 'desc' }
  });

  if (!activeOrClosed) {
      // No election active or closed found. Maybe DRAFT? 
      // If absolutely no election is running, maybe we shouldn't allow voting/capture operations?
      // Or maybe we allow setup?
      // The prompt is specific: "Si NO hay elección activa... LANZA ERROR".
      // This implies system must have an ACTIVE election to accept writes for these modules.
      throw new Error("⛔ NO HAY ELECCIÓN ACTIVA. Operación rechazada.");
  }

  if (activeOrClosed.status === 'CLOSED') {
      throw new Error("⛔ LA ELECCIÓN ESTÁ CERRADA. Operación rechazada por protocolo forense.");
  }
  
  // If status is ACTIVE, pass.
}
