interface TenantStoragePathOptions {
  readonly tenantId: string;
  readonly module: string;
  readonly path: string;
  readonly allowedExtensions: readonly string[];
}

export function isOwnedCanonicalStoragePath({
  tenantId,
  module,
  path,
  allowedExtensions,
}: TenantStoragePathOptions): boolean {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId) ||
    !/^[a-z0-9-]{1,64}$/.test(module) ||
    typeof path !== 'string' ||
    allowedExtensions.length === 0
  ) {
    return false;
  }

  const expectedPrefix = `${tenantId}/${module}/`;
  if (!path.startsWith(expectedPrefix)) {
    return false;
  }

  const objectName = path.slice(expectedPrefix.length);
  if (
    !objectName ||
    objectName.includes('/') ||
    objectName.includes('\\') ||
    objectName.includes('%') ||
    objectName.includes('..')
  ) {
    return false;
  }

  const normalizedExtensions = allowedExtensions.map((extension) =>
    extension.toLowerCase(),
  );
  if (
    normalizedExtensions.some(
      (extension) => !/^[a-z0-9]{1,10}$/.test(extension),
    )
  ) {
    return false;
  }

  const extensionAlternation = normalizedExtensions.join('|');
  if (!extensionAlternation) {
    return false;
  }

  const canonicalName = new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(${extensionAlternation})$`,
    'i',
  );

  return canonicalName.test(objectName);
}
