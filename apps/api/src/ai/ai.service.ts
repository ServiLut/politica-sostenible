import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Procesa una imagen para extraer datos de identidad colombiana.
   * En una implementación real, esto usaría Gemini Vision API.
   */
  async extractVoterData(file: Express.Multer.File) {
    this.logger.log(`Procesando imagen OCR: ${file.originalname}`);

    const mockIdentities = [
      {
        documentId: '1020304050',
        firstName: 'MARIA ANGELICA',
        lastName: 'LOPEZ',
      },
      {
        documentId: '1190223344',
        firstName: 'CARLOS ANDRES',
        lastName: 'RODRIGUEZ',
      },
      {
        documentId: '1000555666',
        firstName: 'DIANA PATRICIA',
        lastName: 'GOMEZ',
      },
    ];

    const detected =
      mockIdentities[Math.floor(Math.random() * mockIdentities.length)];

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ...detected,
          confidence: 0.99,
          processedBy: 'Gemini-1.5-Pro-Vision',
          metadata: {
            isColombianId: true,
            issueDate: '2015-05-20',
          },
        });
      }, 2000);
    });
  }

  /**
   * Procesa una factura/recibo para extraer datos contables para el CNE.
   */
  async extractReceiptData(file: Express.Multer.File) {
    this.logger.log(`Procesando recibo OCR: ${file.originalname}`);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          vendorName: 'IMPRESIONES EL DORADO SAS',
          vendorTaxId: '900123456-1',
          amount: 1250000,
          cneCode: '108', // Publicidad en Vallas
          description: 'Impresión de 5 vallas tipo Araña',
          confidence: 0.95,
          processedBy: 'Gemini-1.5-Pro-Vision',
        });
      }, 2000);
    });
  }

  /**
   * Analiza el sentimiento y regionalismos de un comentario.
   */
  analyzeRegionalSentiment(text: string) {
    // Ejemplo de lógica mencionada en la doc (punto 5.3)
    const isCosteno = text.toLowerCase().includes('culebra');
    return {
      sentiment: 'Neutral',
      isCosteno,
      analysis: isCosteno
        ? 'Detectado regionalismo "Culebra" (Deuda/Problema)'
        : 'Lenguaje estándar',
    };
  }

  /**
   * Procesa consultas en lenguaje natural sobre los datos de la campaña.
   */
  chat(_tenantId: string, prompt: string) {
    this.logger.log(`Consulta IA recibida: ${prompt}`);

    // Simulación de lógica RAG (Retrieval Augmented Generation)
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('votantes') || lowerPrompt.includes('cuántos')) {
      return {
        answer:
          'He analizado la base de datos. Actualmente tienes **1,284** simpatizantes registrados. La mayor concentración se encuentra en la **Zona Norte (Comuna 2)** con un crecimiento del 15% esta semana.',
        actionable:
          'Podrías reforzar la recolección en la Comuna 4 donde el ritmo ha bajado.',
        suggestedTools: ['query_voter_segment'],
      };
    }

    if (
      lowerPrompt.includes('plata') ||
      lowerPrompt.includes('gasto') ||
      lowerPrompt.includes('finanzas')
    ) {
      return {
        answer:
          'El presupuesto ejecutado es de **$45,200,000**. Estás al **62%** del tope permitido por el CNE para esta fase. He detectado 3 facturas sin soporte digital que podrían generar alertas.',
        actionable:
          "Sube las evidencias de los gastos en 'Publicidad Radial' antes del viernes.",
        suggestedTools: ['check_cne_compliance'],
      };
    }

    return {
      answer:
        'Estoy listo para ayudarte a ganar en 2026. Puedo analizar votantes, finanzas o reportes del Día D. ¿Qué necesitas saber?',
      actionable: null,
      suggestedTools: [],
    };
  }
}
