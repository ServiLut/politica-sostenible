export type Channel = 'WHATSAPP' | 'SMS_FLASH' | 'SMS_STANDARD' | 'IVR';

export interface MessagePayload {
  to: string; // E.164
  content: string;
  templateId?: string; // For WhatsApp
  templateVariables?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  providerResponse?: any;
}

export interface IMessageProvider {
  sendWhatsApp(payload: MessagePayload): Promise<SendResult>;
  sendSMS(payload: MessagePayload, isFlash: boolean): Promise<SendResult>;
  sendIVR(payload: MessagePayload): Promise<SendResult>;
}
