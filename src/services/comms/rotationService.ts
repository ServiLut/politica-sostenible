import { prisma } from '@/lib/prisma';
// import {  ChannelType } from '@prisma/client';

// 

export class RotationService {
  
  /**
   * Selects the optimal Sender Number for a specific channel.
   * Algorithm:
   * 1. Filter out blocked numbers.
   * 2. Filter out numbers with Reputation < 50.
   * 3. Sort by 'Last Used' (Least Recently Used) to distribute load.
   * 4. Weight by Reputation (Higher reputation preferred).
   */
  async getOptimalSenderNumber(channelType: any): Promise<string | null> {
    /*
    const availableNumbers = await prisma.senderNumber.findMany({
      where: {
        channel: { type: channelType },
        isBlocked: false,
        reputationScore: { gt: 50 } // Quality Threshold
      },
      orderBy: [
        { lastUsedAt: 'asc' }, // Prioritize rested numbers (LRU)
        { reputationScore: 'desc' }
      ],
      take: 5 // Consider top 5 candidates
    });

    if (availableNumbers.length === 0) {
      console.warn(`ROTATION_ALERT: No healthy numbers available for channel ${channelType}`);
      return null;
    }

    // Simple Round-Robin / Random selection among top candidates to avoid race conditions
    // In high-load, strict LRU causes hotspots on the same number if concurrent requests happen.
    const selected = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

    // Async update usage timestamp (don't await to block response)
    this.updateUsageStats(selected.id);

    return selected.id;
    */
    return null;
  }

  /**
   * Updates usage stats after selection.
   */
  // private async updateUsageStats(senderId: string) {
  //   try {
  //     await prisma.senderNumber.update({
  //       where: { id: senderId },
  //       data: {
  //         lastUsedAt: new Date(),
  //         messagesSent: { increment: 1 }
  //       }
  //     });
  //   } catch (e) {
  //     console.error('Failed to update stats for sender:', senderId);
  //   }
  // }

  /**
   * Feedback Loop: Degrading reputation on block/spam reports.
   * Call this when a 'failed' webhook arrives with reason 'spam_detected'.
   */
  // async degradeReputation(senderId: string, amount = 10) {
  //   await prisma.senderNumber.update({
  //     where: { id: senderId },
  //     data: {
  //       reputationScore: { decrement: amount }
  //     }
  //   });
  // }
}
