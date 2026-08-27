import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { StorageService } from './storage.service';
import { Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Storage')
@ApiBearerAuth()
@Roles(...Object.values(Role))
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Genera una URL temporal para subir directamente a Storage',
  })
  createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUploadUrlDto,
  ) {
    return this.storageService.createUploadUrl(user, dto);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verifica y confirma una subida directa ya terminada',
  })
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.storageService.completeUpload(user, dto);
  }
}
