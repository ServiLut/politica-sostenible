import { prisma } from '@/lib/prisma';
import {  PoliticalContact } from '@prisma/client';



type Channel = 'WHATSAPP' | 'SMS_FLASH' | 'IVR';

interface MessageRequest {
  contactId: string;
  content: string;
  campaignId: string; // Required for logging/billing context
  messageType?: string; // 'info', 'alert', 'mobilization'
}

interface ProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Configuración Simulada del Pool de Números
const NUMBER_POOL = {
  WHATSAPP: ['+573001001000', '+573001001001', '+573001001002'],
  SMS: ['+573002002000', '+573002002001'],
  IVR: ['+573003003000']
};

export class MessageRouterService {

  /**
   * ENTRY POINT: Dispatch a message with Failover Cascade.
   */
  async dispatchMessage(req: MessageRequest): Promise<void> {
    // 1. Validate Contact & Opt-Out
    const contact = await prisma.politicalContact.findUnique({
      where: { id: req.contactId },
      include: { person: true }
    });

    if (!contact) throw new Error('Contact not found');
    
    // STRICT RULE: Opt-out blocks everything
    if (contact.status === 'opt_out') {
      console.warn(`BLOCKED: Contact ${req.contactId} has opted out.`);
      return;
    }

    // 2. Create the Message Record (Parent)
    const messageRecord = await prisma.message.create({
      data: {
        campaignId: req.campaignId,
        type: req.messageType || 'info',
        content: req.content,
      }
    });

    // 3. Start Cascade
    // LEVEL 1: WhatsApp
    const waSuccess = await this.tryChannel('WHATSAPP', contact, req.content, messageRecord.id);
    if (waSuccess) return;

    // LEVEL 2: SMS Flash (Failover)
    console.log(`FAILOVER ACTIVATED: ${contact.id} -> SMS Flash`);
    const smsSuccess = await this.tryChannel('SMS_FLASH', contact, req.content, messageRecord.id, 'WHATSAPP_FAILED');
    if (smsSuccess) return;

    // LEVEL 3: IVR (Last Resort)
    // Only for critical messages or mobilization
    if (req.messageType === 'mobilization') {
      console.log(`FAILOVER ACTIVATED: ${contact.id} -> IVR`);
      await this.tryChannel('IVR', contact, req.content, messageRecord.id, 'SMS_FAILED');
    } else {
      console.log(`Cascade ended. Message could not be delivered to ${contact.id}`);
    }
  }

  /**
   * Generic Channel Executor with Logging and Rotation
   */
  private async tryChannel(
    channel: Channel, 
    contact: PoliticalContact & { person: { phone: string } }, 
    content: string, 
    messageId: string,
    fallbackReason?: string
  ): Promise<boolean> {
    
    const senderNumber = this.getRotatedSender(channel);
    let deliveryStatus = 'PENDING';
    let result: ProviderResult = { success: false };

    try {
      // 4. Provider Execution (Strategy Pattern)
      switch (channel) {
        case 'WHATSAPP':
          result = await this.sendWhatsApp(contact.person.phone, content, senderNumber);
          break;
        case 'SMS_FLASH':
          result = await this.sendSMSFlash(contact.person.phone, content, senderNumber);
          break;
        case 'IVR':
          result = await this.sendIVR(contact.person.phone, content, senderNumber);
          break;
      }

      deliveryStatus = result.success ? 'SENT' : 'FAILED';

    } catch (error: any) {
      console.error(`Provider Error [${channel}]:`, error);
      deliveryStatus = 'PROVIDER_ERROR';
      result.error = error.message;
    }

    // 5. Trazabilidad (Audit Log)
    await prisma.messageLog.create({
      data: {
        messageId: messageId,
        politicalContactId: contact.id,
        channelUsed: channel,
        senderNumber: senderNumber,
        deliveryStatus: deliveryStatus,
        fallbackReason: fallbackReason || null,
        // sentAt default now()
      }
    });

    return result.success;
  }

  // --- PROVIDER ADAPTERS (Mocks for Modularity) ---

  private async sendWhatsApp(to: string, body: string, from: string): Promise<ProviderResult> {
    // Logic to call Twilio/Meta API
    // await axios.post(...)
    console.log(`[WhatsApp] Sending to ${to} from ${from}: ${body.substring(0, 20)}...`);
    
    // Simulation: 80% success rate
    const isSuccess = Math.random() > 0.2; 
    return { success: isSuccess };
  }

  private async sendSMSFlash(to: string, body: string, from: string): Promise<ProviderResult> {
    // Flash SMS sets class=0 in PDU
    console.log(`[SMS Flash] Sending to ${to} from ${from}: ${body.substring(0, 20)}...`);
    
    // Simulation: 95% success rate
    const isSuccess = Math.random() > 0.05;
    return { success: isSuccess };
  }

  private async sendIVR(to: string, script: string, from: string): Promise<ProviderResult> {
    // Logic to trigger voice call
    console.log(`[IVR] Calling ${to} from ${from}. Script length: ${script.length}`);
    return { success: true };
  }

  // --- UTILS ---

  private getRotatedSender(channel: Channel): string {
    const pool = (NUMBER_POOL as any)[channel === 'SMS_FLASH' ? 'SMS' : channel] || [];
    if (pool.length === 0) return 'UNKNOWN';
    
    // Simple Random Rotation to distribute load
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }
}

export const messageRouter = new MessageRouterService();

