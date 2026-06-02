import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { FilesService } from './files.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  if (!Number.isInteger(value)) return undefined;
  if (value <= 0) return undefined;
  return value;
}

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload-url')
  async requestUploadUrl(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.filesService.requestUploadUrl(authorization, dto);
  }

  @Post('confirm-upload')
  async confirmUpload(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('x-real-ip') realIp: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() dto: ConfirmUploadDto,
  ) {
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp;
    return this.filesService.confirmUpload(
      authorization,
      dto,
      clientIp,
      userAgent,
    );
  }

  @Get('audit-logs')
  async listAuditLogs(
    @Headers('authorization') authorization: string | undefined,
    @Query('module') module?: string,
    @Query('severity') severity?: string,
    @Query('q') q?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const safePage = parsePositiveInt(page);
    const safePageSize = parsePositiveInt(pageSize);
    const boundedPageSize =
      safePageSize === undefined ? undefined : Math.min(safePageSize, 100);

    return this.filesService.listAuditLogs(authorization, {
      module,
      severity,
      q,
      startDate,
      endDate,
      page: safePage,
      pageSize: boundedPageSize,
    });
  }

  @Post('audit-logs')
  async createAuditLog(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('x-real-ip') realIp: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() dto: CreateAuditLogDto,
  ) {
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp;
    return this.filesService.createAuditLog(
      authorization,
      dto,
      clientIp,
      userAgent,
    );
  }

  @Get()
  async listFiles(
    @Headers('authorization') authorization: string | undefined,
    @Query('module') module?: string,
  ) {
    return this.filesService.listFiles(authorization, module);
  }
}
