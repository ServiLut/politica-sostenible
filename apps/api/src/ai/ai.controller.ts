import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { JwtIdentityService } from '../common/services/jwt-identity.service';

@ApiTags('AI Intelligence')
@Controller('ai')
@UseGuards(RolesGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Post('ocr')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
  )
  @ApiOperation({ summary: 'Extrae datos de cédula usando Gemini Vision' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async performOcr(@UploadedFile() file: Express.Multer.File) {
    return this.aiService.extractVoterData(file);
  }

  @Post('ocr-receipt')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @ApiOperation({
    summary: 'Extrae datos de factura/recibo usando Gemini Vision',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async performReceiptOcr(@UploadedFile() file: Express.Multer.File) {
    return this.aiService.extractReceiptData(file);
  }

  @Post('analyze-sentiment')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  @ApiOperation({ summary: 'Análisis de sentimiento regionalizado' })
  analyzeSentiment(@Body('text') text: string) {
    return this.aiService.analyzeRegionalSentiment(text);
  }

  @Post('chat')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  )
  @ApiOperation({ summary: 'Consulta cognitiva sobre la campaña' })
  async chat(
    @Headers('authorization') authorization: string | undefined,
    @Body('prompt') prompt: string,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.aiService.chat(identity.tenantId, prompt);
  }
}
