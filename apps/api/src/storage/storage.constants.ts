export enum StorageModuleName {
  FINANCE = 'finance',
  E14 = 'e14',
  CONSENT = 'consent',
  ELECTORAL_CATALOG = 'electoral-catalog',
  SCRUTINY = 'scrutiny',
  ELECTORAL_CALENDAR = 'electoral-calendar',
  SIGNATURE_COLLECTION = 'signature-collection',
  PQRSD = 'pqrsd',
}

export const STORAGE_INTEGRITY_REQUIRED_MODULES = [
  StorageModuleName.FINANCE,
  StorageModuleName.E14,
  StorageModuleName.SCRUTINY,
  StorageModuleName.ELECTORAL_CALENDAR,
  StorageModuleName.SIGNATURE_COLLECTION,
  StorageModuleName.PQRSD,
] as const;

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
  [StorageModuleName.CONSENT]: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
  [StorageModuleName.ELECTORAL_CATALOG]: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: {
      'application/json': ['json'],
    },
  },
  [StorageModuleName.SCRUTINY]: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
  [StorageModuleName.ELECTORAL_CALENDAR]: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
  [StorageModuleName.SIGNATURE_COLLECTION]: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
  [StorageModuleName.PQRSD]: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: {
      ...IMAGE_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    },
  },
};

export const STORAGE_MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(STORAGE_UPLOAD_POLICIES).map((policy) => policy.maxBytes),
);

export const STORAGE_MAX_FILE_NAME_LENGTH = 180;
