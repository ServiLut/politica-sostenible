import { Controller, Post, Get, Body, Param, Req, UseGuards, Ip } from '@nestjs/common';
import { ElectronicSignatureService } from './electronic-signature.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-user.interface';
import { IsString, IsNotEmpty } from 'class-validator';

export class SignDocumentDto {
  @IsString()
  @IsNotEmpty()
  documentId: string;

  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

@Controller('electronic-signature')
@UseGuards(JwtAuthGuard)
export class ElectronicSignatureController {
  constructor(private readonly signatureService: ElectronicSignatureService) {}

  @Post('sign')
  async signDocument(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SignDocumentDto,
    @Ip() ip: string,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.signatureService.signDocument(tenantId, dto.documentId, userId, dto.otpCode, ip);
  }

  @Get(':id/verify')
  async verifySignature(
    @Req() req: AuthenticatedRequest,
    @Param('id') signatureId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.signatureService.verifySignature(tenantId, signatureId);
  }
}
