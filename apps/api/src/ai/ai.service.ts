import {
  BadRequestException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  extractVoterData(tenantId: string, objectPath: string): never {
    return this.notConfigured('OCR de cédulas', tenantId, objectPath);
  }

  extractReceiptData(tenantId: string, objectPath: string): never {
    return this.notConfigured(
      'OCR de soportes contables',
      tenantId,
      objectPath,
    );
  }

  analyzeRegionalSentiment(tenantId: string, text: string): never {
    if (!text.trim()) {
      throw new BadRequestException('El texto no puede estar vacío');
    }

    return this.notConfigured('Análisis de sentimiento', tenantId);
  }

  chat(tenantId: string, prompt: string): never {
    if (!prompt.trim()) {
      throw new BadRequestException('La consulta no puede estar vacía');
    }

    return this.notConfigured('Asistente cognitivo', tenantId);
  }

  private notConfigured(
    capability: string,
    tenantId: string,
    objectPath?: string,
  ): never {
    this.logger.warn(
      `${capability} no configurado para tenant ${tenantId}${objectPath ? ' con objeto almacenado' : ''}`,
    );
    throw new NotImplementedException({
      status: 'NOT_CONFIGURED',
      capability,
      message:
        'Esta función requiere un proveedor aprobado y ejecución asíncrona con BullMQ.',
    });
  }
}
