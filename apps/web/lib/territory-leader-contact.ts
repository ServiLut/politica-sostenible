/** A WhatsApp URL needs an international number, without duplicating Colombia's prefix. */
export function getLeaderWhatsAppHref(phone: string | null): string | null {
  const value = phone?.trim();
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (/^3\d{9}$/.test(digits)) return `https://wa.me/57${digits}`;
  if (/^573\d{9}$/.test(digits)) return `https://wa.me/${digits}`;
  if (value.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) {
    return `https://wa.me/${digits}`;
  }
  return null;
}

export function getPublicProfileHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
