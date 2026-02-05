import { prisma } from '@/lib/prisma';
// import {  TransferStatus, ActorRole } from '@prisma/client';

// 

/**
 * Service to manage the "Controlled Contact Transfer" lifecycle.
 * Ensures strict ownership rules and auditability.
 */
export class ContactOwnershipService {

  /**
   * 1. VALIDATION OF OWNERSHIP
   * Checks if a Person is already a PoliticalContact managed by someone else.
   * Enforces strict "First to Register is Owner" rule.
   * 
   * @param personId - The ID of the person to check.
   * @returns The existing owner's Actor ID or null if free.
   */
  async checkOwnership(personId: string): Promise<{ ownerId: string; ownerName: string } | null> {
    /*
    const existingContact = await prisma.politicalContact.findUnique({
      where: { personId },
      include: {
        leader: {
          include: { person: true }
        }
      }
    });

    if (existingContact) {
      return {
        ownerId: existingContact.leaderId,
        ownerName: `${existingContact.leader.person.firstName} ${existingContact.leader.person.lastName}`
      };
    }
    */
    return null;
  }

  /**
   * 2. TRANSFER REQUEST FLOW
   * Initiates a request to transfer a contact from one leader to another.
   * 
   * @param contactId - The ID of the PoliticalContact to transfer.
   * @param requestingLeaderId - The Actor ID of the leader asking for the contact.
   * @param reason - Text justification.
   * @param evidenceUrl - Optional proof URL (e.g., photo of signed form).
   */
  async requestTransfer(
    contactId: string,
    requestingLeaderId: string,
    reason: string,
    evidenceUrl?: string
  ): Promise<any> {
    /*
    // A. Validate existence and current state
    const contact = await prisma.politicalContact.findUnique({
      where: { id: contactId },
      include: { leader: true }
    });

    if (!contact) {
      throw new Error('Contact not found.');
    }

    if (contact.leaderId === requestingLeaderId) {
      throw new Error('You already own this contact.');
    }

    // B. Check for pending requests (Prevent spamming requests)
    const existingRequest = await prisma.transferRequest.findFirst({
      where: {
        contactId,
        requestingLeaderId,
        status: TransferStatus.PENDING
      }
    });

    if (existingRequest) {
      throw new Error('A pending transfer request already exists for this contact.');
    }

    // C. Create the Transfer Request
    // This does NOT change the owner yet.
    return await prisma.transferRequest.create({
      data: {
        contactId,
        currentLeaderId: contact.leaderId,
        requestingLeaderId,
        reason,
        evidenceUrl,
        status: TransferStatus.PENDING
      }
    });
    */
   throw new Error("Not implemented");
  }

  /**
   * 3. APPROVAL FLOW
   * Only a COORDINATOR (or higher) can execute this.
   * Atomically updates ownership and logs the decision.
   * 
   * @param requestId - ID of the TransferRequest.
   * @param reviewerActorId - ID of the Actor reviewing (must be COORDINATOR).
   * @param approved - Boolean decision.
   * @param notes - Reviewer's justification.
   */
  async reviewTransfer(
    requestId: string,
    reviewerActorId: string,
    approved: boolean,
    notes?: string
  ): Promise<any> {
    /*
    // A. Validate Reviewer Role
    const reviewer = await prisma.actor.findUnique({
      where: { id: reviewerActorId }
    });

    if (!reviewer || (reviewer.role !== ActorRole.COORDINADOR && reviewer.role !== ActorRole.ORGANIZACION)) {
      throw new Error('Unauthorized: Only Coordinators or Organization can review transfers.');
    }

    const request = await prisma.transferRequest.findUnique({
      where: { id: requestId },
      include: { contact: true }
    });

    if (!request) throw new Error('Request not found.');
    if (request.status !== TransferStatus.PENDING) throw new Error('Request is already processed.');

    // B. Execute Logic inside a Transaction
    return await prisma.$transaction(async (tx) => {
      
      const newStatus = approved ? TransferStatus.APPROVED : TransferStatus.REJECTED;

      // 1. Update Request Status
      const updatedRequest = await tx.transferRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          reviewedById: reviewerActorId,
          reviewerNotes: notes
        }
      });

      // 2. If Approved, CHANGE OWNERSHIP
      if (approved) {
        // Double-check race condition: ensure current leader hasn't changed since request
        const currentContact = await tx.politicalContact.findUnique({
           where: { id: request.contactId } 
        });

        if (currentContact?.leaderId !== request.currentLeaderId) {
           throw new Error('Conflict: The contact owner changed while this request was pending.');
        }

        // Perform the switch
        await tx.politicalContact.update({
          where: { id: request.contactId },
          data: {
            leaderId: request.requestingLeaderId,
            // Audit trail in the contact itself if needed, though AuditLog covers it
            notes: `Transfer approved by ${reviewer.id} on ${new Date().toISOString()}. Prev Owner: ${request.currentLeaderId}.`
          }
        });

        // 3. Create Immutable Audit Log
        await tx.auditLog.create({
          data: {
            action: 'CONTACT_TRANSFER',
            resource: 'PoliticalContact',
            resourceId: request.contactId,
            userId: reviewer.userId, // Linking to the system user of the reviewer
            details: {
              requestId: request.id,
              previousOwner: request.currentLeaderId,
              newOwner: request.requestingLeaderId,
              reason: request.reason,
              reviewerNotes: notes
            }
          }
        });
      }

      return updatedRequest;
    });
    */
   throw new Error("Not implemented");
  }
}
