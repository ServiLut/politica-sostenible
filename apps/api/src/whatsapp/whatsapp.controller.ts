import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // Webhook para Meta/Twilio
  @Post('webhook')
  async handleIncomingMessage(@Body() body: any) {
    return this.whatsappService.processWebhook(body);
  }

  // Verificación de webhook (requerido por Meta)
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      throw new ForbiddenException(
        'WHATSAPP_VERIFY_TOKEN no está configurado',
      );
    }

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }

    throw new ForbiddenException('Token de verificación inválido');
  }
}
