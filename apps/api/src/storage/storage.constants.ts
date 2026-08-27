export enum StorageModuleName {
  FINANCE = 'finance',
  E14 = 'e14',
  EVIDENCE = 'evidence',
  AVATARS = 'avatars',
}

export interface StorageUploadPolicy {
  readonly maxBytes: number;
  readonly mimeTypes: Readonly<Record<string, readonly string[]>>;
}

const IMAGE_MIME_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
} as const;

const DOCUMENT_MIME_TYPES = {
  'application/pdf': ['pdf'],
} as const;

export const STORAGE_UPLOAD_POLICIES: Readonly<
  Record<StorageModuleName, StorageUploadPolicy>
> = {
  [StorageModuleName.FINANCE]: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
      'text/csv': ['csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        'xlsx',
      ],
    },
  },
  [StorageModuleName.E14]: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
  [StorageModuleName.EVIDENCE]: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
      'video/mp4': ['mp4'],
      'video/quicktime': ['mov'],
      'audio/mpeg': ['mp3'],
      'audio/mp4': ['m4a'],
    },
  },
  [StorageModuleName.AVATARS]: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: IMAGE_MIME_TYPES,
  },
};

export const STORAGE_MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(STORAGE_UPLOAD_POLICIES).map((policy) => policy.maxBytes),
);

export const STORAGE_MAX_FILE_NAME_LENGTH = 180;
