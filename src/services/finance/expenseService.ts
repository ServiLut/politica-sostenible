// import { prisma } from '@/lib/prisma';

// 

interface ExpenseInput {
  eventId: string;
  amount: number;
  type: string;
  category: string;
  responsibleId: string;
  evidenceUrl?: string;
}

export class ExpenseService {

  /**
   * REIMBURSEMENT FLOW
   * Records an expense with validation and auto-budget check.
   */
  async submitExpense(data: ExpenseInput) {
    /*
    return await prisma.$transaction(async (tx) => {
      // 1. Validate Event State
      const event = await tx.event.findUnique({
        where: { id: data.eventId },
        select: { status: true, territoryId: true }
      });

      if (!event) throw new Error('Event not found.');
      // if (event.status === 'CANCELLED') throw new Error('Cannot report expenses for cancelled events.');

      // 2. Create Expense
      const expense = await tx.expense.create({
        data: {
          eventId: data.eventId,
          amount: data.amount,
          type: data.type,
          uxCategory: data.category, // e.g. 'Transport', 'Food'
          // cneCategoryId: mapToCne(data.category), // Auto-mapping logic
          responsibleUserId: data.responsibleId,
          evidencePhotoUrl: data.evidenceUrl
        }
      });

      // 3. Update Event Totals (Aggregated Cache)
      // This allows instant dashboarding without summing rows every time
      await tx.event.update({
        where: { id: data.eventId },
        data: {
          estimatedCost: { increment: data.amount } 
          // Note: Ideally we have 'actualCost' field separately from 'estimatedCost'
        }
      });

      return expense;
    });
    */
    throw new Error("Not implemented");
  }
}
