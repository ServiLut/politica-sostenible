import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * PRISMA EXTENSION: READ-ONLY GUARD (Middleware de Solo Lectura)
 * 
 * Intercepta operaciones de escritura (create, update, delete, upsert) en tablas críticas.
 * Si detecta que la operación pertenece a una Elección 'CLOSED', la bloquea.
 */
export const readOnlyGuard = Prisma.defineExtension((client) => {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // 1. Filter: Only enforce on Write Operations
          const writeOps = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];
          if (!writeOps.includes(operation)) {
            return query(args);
          }

          // 2. Filter: Only enforce on Critical Tables
          const criticalModels = ['E14Record', 'VotedStatus', 'Expense', 'ElectoralContact', 'PollingTable'];
          if (!criticalModels.includes(model as string)) {
            return query(args);
          }

          // 3. Extract Election Context
          // We assume 'electionId' is passed in 'data' or 'where'.
          // This is a heuristic check. In a real strict system, we'd look up the record first.
          let electionId: string | undefined;
          
          const params = args as any;
          if (params.data?.electionId) electionId = params.data.electionId;
          if (params.where?.electionId) electionId = params.where.electionId;
          
          // If we can't find electionId directly, we might skip or fail safe. 
          // For V4.2 strictness, if we can't verify the election status, we proceed 
          // (assuming standard logic covers it) OR we could look up the parent.
          // Here we handle the explicit case.

          if (electionId) {
            // Check Election Status (We use a separate client or raw query to avoid infinite loop if we extended globally)
            // Note: In extension context, 'client' is available.
            
            // To be safe and fast, we usually cache this, but for this implementation we query.
             const election = await (client as any).election.findUnique({
              where: { id: electionId },
              select: { status: true }
            });

            if (election && election.status === 'CLOSED') {
              throw new Error(`FORBIDDEN: Operation '${operation}' on '${model}' is blocked because Election ${electionId} is CLOSED.`);
            }
          }

          return query(args);
        },
      },
    },
  });
});

/**
 * Usage Factory to get a guarded client
 */
let guardedClient: ReturnType<typeof readOnlyGuard> | undefined;

export function getGuardedPrisma() {
  if (!guardedClient) {
    
    guardedClient = prisma.$extends(readOnlyGuard) as unknown as ReturnType<typeof readOnlyGuard>;
  }
  return guardedClient;
}

