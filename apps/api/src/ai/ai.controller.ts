import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { AnalyzeSentimentDto } from './dto/analyze-sentiment.dto';
import { StoredObjectDto } from './dto/stored-object.dto';

const ALLOWED_STORAGE_MODULES = new Set(['evidence', 'e14', 'finance']);
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,240}\.[A-Za-z0-9]{1,10}$/;

@ApiTags('AI Intelligence')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ocr')
  @ApiOperation({ summary: 'Encola OCR de una cédula almacenada' })
  performOcr(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StoredObjectDto,
  ) {
    const objectPath = this.validateTenantObjectPath(user.tenantId, dto);
    return this.aiService.extractVoterData(user.tenantId, objectPath);
  }

  @Post('ocr-receipt')
  @ApiOperation({ summary: 'Encola OCR de un soporte contable almacenado' })
  performReceiptOcr(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StoredObjectDto,
  ) {
    const objectPath = this.validateTenantObjectPath(user.tenantId, dto);
    return this.aiService.extractReceiptData(user.tenantId, objectPath);
  }

  @Post('analyze-sentiment')
  @ApiOperation({ summary: 'Solicita análisis de sentimiento' })
  analyzeSentiment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeSentimentDto,
  ) {
    return this.aiService.analyzeRegionalSentiment(user.tenantId, dto.text);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Consulta cognitiva sobre la campaña' })
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiChatDto) {
    return this.aiService.chat(user.tenantId, dto.prompt);
  }

  private validateTenantObjectPath(
    tenantId: string,
    dto: StoredObjectDto,
  ): string {
    const expectedPrefix = `${tenantId}/`;
    if (!dto.objectPath.startsWith(expectedPrefix)) {
      throw new ForbiddenException(
        'El objeto no pertenece a la campaña autenticada',
      );
    }

    if (dto.objectPath.includes('\\') || dto.objectPath.includes('%')) {
      throw new BadRequestException('Ruta de objeto inválida');
    }

    const parts = dto.objectPath.split('/');
    if (parts.length !== 3) {
      throw new BadRequestException(
        'La ruta debe usar tenant/módulo/nombre_archivo.ext',
      );
    }

    const [, moduleName, filename] = parts;
    if (!ALLOWED_STORAGE_MODULES.has(moduleName)) {
      throw new BadRequestException('Módulo de almacenamiento no permitido');
    }

    if (!SAFE_FILENAME.test(filename)) {
      throw new BadRequestException('Nombre de archivo inválido');
    }

    return dto.objectPath;
  }
}
