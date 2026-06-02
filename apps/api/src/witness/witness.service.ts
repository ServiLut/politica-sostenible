import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WitnessService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService
  ) {}

  async create(tenantId: string, witnessId: string, data: any) {
    // 1. Iniciar la creación del reporte
    const reportData = {
      ...data,
      tenantId,
      witnessId,
      auditStatus: 'PENDING',
    };

    // 2. Extraer datos del E-14 usando OCR (Preconteo Paralelo)
    if (data.e14ImageUrl) {
      try {
        const ocrResult: any = await this.aiService.extractE14Data(data.e14ImageUrl);
        reportData.e14OcrData = ocrResult;
        reportData.ocrConfidence = ocrResult.confidence;
        
        // 3. Auditoría automática: Comparar OCR con lo reportado por el testigo
        if (ocrResult.candidateVotes === data.candidateVotes && ocrResult.totalTableVotes === data.totalTableVotes) {
          reportData.auditStatus = 'MATCHED';
        } else {
          reportData.auditStatus = 'DISCREPANCY';
        }
      } catch (error) {
        console.error("Error procesando OCR del E-14:", error);
        reportData.auditStatus = 'MANUAL_REVIEW_REQUIRED';
      }
    }

    return this.prisma.witnessReport.create({
      data: reportData,
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.witnessReport.findMany({
      where: { tenantId },
      include: {
        puesto: true,
        witness: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
