import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private prisma: PrismaService) {}

  async processWebhook(body: any) {
    this.logger.log('Recibido webhook de WhatsApp', JSON.stringify(body));

    // Simulación de procesamiento de mensaje entrante (Meta Graph API)
    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value.messages) {
            const message = change.value.messages[0];
            const fromPhone = message.from;
            const text = message.text?.body;
            const toPhone = change.value.metadata.display_phone_number || 'BOT';

            this.logger.log(`Mensaje de ${fromPhone}: ${text}`);

            // En un caso real, aquí conectaríamos con aiService.chat() para responder
            // y guardaríamos el mensaje en Prisma.

            const tenantId = await this.resolveTenantIdForPhone(toPhone);
            if (!tenantId) {
              this.logger.warn(
                `Webhook de WhatsApp ignorado: no existe tenant configurado para ${toPhone}`,
              );
              continue;
            }

            try {
              await this.prisma.whatsAppMessage.create({
                data: {
                  tenantId,
                  fromPhone,
                  toPhone,
                  body: text || 'Media/Other',
                  direction: 'INBOUND',
                  status: 'DELIVERED',
                },
              });
            } catch (e) {
              this.logger.error('Error guardando mensaje', e);
            }
          }
        }
      }
    }

    return { status: 'ok' };
  }

  private async resolveTenantIdForPhone(
    displayPhoneNumber?: string,
  ): Promise<string | null> {
    if (!displayPhoneNumber) {
      return null;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        config: {
          path: ['whatsapp', 'displayPhoneNumber'],
          equals: displayPhoneNumber,
        },
      },
      select: { id: true },
    });

    return tenant?.id ?? null;
  }
}
