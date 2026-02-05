import { prisma } from '@/lib/prisma';



interface SendRequest {
    messageId: string;
    contactId: string;
    phone: string;
    content: string;
}

export class MessageRouter {
    
    // Simulate External APIs
    private static async sendWhatsApp(phone: string, content: string): Promise<boolean> {
        console.log(`[WA] Sending to ${phone}: ${content}`);
        // Simulate 90% success
        return Math.random() > 0.1;
    }

    private static async sendSMS(phone: string, content: string): Promise<boolean> {
        console.log(`[SMS] Sending to ${phone}: ${content}`);
        // Simulate 95% success
        return Math.random() > 0.05;
    }

    private static async sendIVR(phone: string, content: string): Promise<boolean> {
        console.log(`[IVR] Calling ${phone}: "This is an automated message..."`);
        return true; // IVR usually connects
    }

    static async dispatch(req: SendRequest) {
        let channel = 'whatsapp';
        let success = false;
        let failureReason = '';

        // 1. Try WhatsApp
        try {
            success = await this.sendWhatsApp(req.phone, req.content);
            if (!success) throw new Error('No ACK');
        } catch (e) {
            failureReason = 'WA Failed/Timeout';
            
            // 2. Fallback SMS
            try {
                channel = 'sms';
                success = await this.sendSMS(req.phone, req.content);
                if (!success) throw new Error('Delivery Failed');
            } catch (e2) {
                failureReason = 'SMS Failed';

                // 3. Fallback IVR (Critical)
                try {
                    channel = 'ivr';
                    success = await this.sendIVR(req.phone, req.content);
                } catch (e3) {
                    channel = 'failed';
                    failureReason = 'All channels failed';
                }
            }
        }

        // Log result
        await prisma.messageLog.create({
            data: {
                messageId: req.messageId,
                politicalContactId: req.contactId,
                channelUsed: channel,
                senderNumber: 'SYSTEM',
                deliveryStatus: success ? 'DELIVERED' : 'FAILED',
                fallbackReason: failureReason || null
            }
        });

        return { success, channel };
    }

    static async sendSystemAlert(phone: string, content: string) {
        // Direct channel attempt (WA -> SMS)
        let success = await this.sendWhatsApp(phone, content);
        if (!success) {
            success = await this.sendSMS(phone, content);
        }
        return success;
    }
}
