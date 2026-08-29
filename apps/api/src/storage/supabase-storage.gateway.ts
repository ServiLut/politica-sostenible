import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

export interface SignedUploadData {
  readonly signedUrl: string;
  readonly token: string;
}

export interface SignedDownloadData {
  readonly signedUrl: string;
}

export interface StoredObjectInfo {
  readonly name: string;
  readonly size?: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly metadata?: Record<string, unknown>;
}

type SupabaseStorageClient = ReturnType<typeof createClient>;
type SupabaseBucketClient = ReturnType<
  SupabaseStorageClient['storage']['from']
>;

@Injectable()
export class SupabaseStorageGateway {
  private readonly logger = new Logger(SupabaseStorageGateway.name);
  private readonly client: SupabaseStorageClient;
  private readonly bucketClient: SupabaseBucketClient;
  readonly bucketName: string;

  constructor(configService: ConfigService) {
    const supabaseUrl = this.requiredConfig(configService, 'SUPABASE_URL');
    const serviceRoleKey = this.requiredConfig(
      configService,
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    this.bucketName = this.requiredConfig(
      configService,
      'SUPABASE_STORAGE_BUCKET',
    );

    this.validateSupabaseUrl(supabaseUrl);
    this.validateServiceRoleKey(serviceRoleKey);
    this.validateBucketName(this.bucketName);

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    this.bucketClient = this.client.storage.from(this.bucketName);
  }

  async createSignedUploadUrl(path: string): Promise<SignedUploadData> {
    await this.assertPrivateBucket();

    const { data, error } = await this.bucketClient.createSignedUploadUrl(
      path,
      { upsert: false },
    );

    if (error || !data) {
      this.logger.error(
        `No fue posible firmar una subida a Storage: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'No fue posible autorizar la subida del archivo',
      );
    }

    return {
      signedUrl: data.signedUrl,
      token: data.token,
    };
  }

  async getObjectInfo(path: string): Promise<StoredObjectInfo | null> {
    await this.assertPrivateBucket();

    const { data, error } = await this.bucketClient.info(path);

    if (error || !data) {
      if (this.isNotFound(error)) {
        return null;
      }

      this.logger.error(
        `No fue posible verificar un objeto en Storage: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'No fue posible verificar el archivo almacenado',
      );
    }

    return {
      name: data.name,
      ...(typeof data.size === 'number' ? { size: data.size } : {}),
      ...(typeof data.contentType === 'string'
        ? { contentType: data.contentType }
        : {}),
      ...(typeof data.etag === 'string' ? { etag: data.etag } : {}),
      ...(data.metadata ? { metadata: data.metadata } : {}),
    };
  }

  async createSignedDownloadUrl(
    path: string,
    expiresInSeconds = 300,
  ): Promise<SignedDownloadData> {
    await this.assertPrivateBucket();

    const { data, error } = await this.bucketClient.createSignedUrl(
      path,
      expiresInSeconds,
      { download: false },
    );

    if (error || !data) {
      this.logger.error(
        `No fue posible firmar una lectura de Storage: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'No fue posible autorizar la lectura del archivo',
      );
    }

    return { signedUrl: data.signedUrl };
  }

  async removeObject(path: string): Promise<void> {
    await this.assertPrivateBucket();
    const { error } = await this.bucketClient.remove([path]);

    if (error && !this.isNotFound(error)) {
      this.logger.error(
        `No fue posible retirar un objeto huérfano: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'No fue posible completar la limpieza del almacenamiento privado',
      );
    }
  }

  private async assertPrivateBucket(): Promise<void> {
    const { data, error } = await this.client.storage.getBucket(
      this.bucketName,
    );

    if (error || !data) {
      this.logger.error(
        `No fue posible verificar el bucket privado: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está disponible',
      );
    }

    if (data.public) {
      this.logger.error(
        `El bucket configurado "${this.bucketName}" es público y fue rechazado`,
      );
      throw new InternalServerErrorException(
        'El bucket de archivos debe estar configurado como privado',
      );
    }
  }

  private requiredConfig(configService: ConfigService, key: string): string {
    const value = configService.get<string>(key)?.trim();

    if (!value) {
      throw new Error(`${key} es obligatorio para Supabase Storage`);
    }

    return value;
  }

  private validateSupabaseUrl(value: string): void {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error('SUPABASE_URL debe ser una URL válida');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('SUPABASE_URL debe usar HTTP o HTTPS');
    }

    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error('SUPABASE_URL debe usar HTTPS en producción');
    }
  }

  private validateServiceRoleKey(value: string): void {
    if (value.startsWith('sb_secret_')) {
      return;
    }

    try {
      const [, encodedPayload] = value.split('.');
      if (!encodedPayload) {
        throw new Error('missing payload');
      }

      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as { role?: unknown };

      if (payload.role !== 'service_role') {
        throw new Error('invalid role');
      }
    } catch {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY debe ser una credencial service_role válida',
      );
    }
  }

  private validateBucketName(value: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value)) {
      throw new Error('SUPABASE_STORAGE_BUCKET contiene un nombre inválido');
    }
  }

  private isNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { status?: unknown; statusCode?: unknown };
    return [candidate.status, candidate.statusCode].some(
      (status) => Number(status) === 404,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
