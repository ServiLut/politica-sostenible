import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';

@ApiTags('AI Intelligence')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ocr')
  @ApiOperation({ summary: 'Extrae datos de cédula usando Gemini Vision' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async performOcr(@UploadedFile() file: Express.Multer.File) {
    return this.aiService.extractVoterData(file);
  }

  @Post('ocr-receipt')
  @ApiOperation({
    summary: 'Extrae datos de factura/recibo usando Gemini Vision',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async performReceiptOcr(@UploadedFile() file: Express.Multer.File) {
    return this.aiService.extractReceiptData(file);
  }

  @Post('analyze-sentiment')
  @ApiOperation({ summary: 'Análisis de sentimiento regionalizado' })
  analyzeSentiment(@Body('text') text: string) {
    return this.aiService.analyzeRegionalSentiment(text);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Consulta cognitiva sobre la campaña' })
  chat(@Body('prompt') prompt: string, @Body('tenantId') tenantId: string) {
    return this.aiService.chat(tenantId, prompt);
  }
}
