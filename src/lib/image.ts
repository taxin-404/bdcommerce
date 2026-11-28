export const IMAGE_SIZES = ['thumb', 'md', 'full'] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export const IMAGE_WIDTHS: Record<ImageSize, number> = {
  thumb: 400,
  md: 800,
  full: 1600,
};

export const IMAGE_MAX_BYTES = 1024 * 1024;

export function imageBaseKey(productId: number, uuid: string): string {
  return `products/${productId}/${uuid}`;
}

export function imageVariantKey(baseKey: string, size: ImageSize): string {
  return `${baseKey}-${size}.webp`;
}

export function imageUrl(baseKey: string, size: ImageSize, publicUrl: string): string {
  const key = imageVariantKey(baseKey, size);
  const base = publicUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/${key}` : `/img/${key}`;
}

export function brandLogoKey(uuid: string): string {
  return `brand/${uuid}.webp`;
}

export function brandLogoUrl(key: string, publicUrl: string): string {
  const base = publicUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/${key}` : `/img/${key}`;
}

/** The Settings image address wins over the R2_PUBLIC_URL variable. */
export function resolveImageBase(
  settingsAddress: string | null | undefined,
  envAddress: string | null | undefined,
): string {
  return (settingsAddress?.trim() || envAddress?.trim() || '').replace(/\/+$/, '');
}

/** Reads only the `images` settings row; used where the full config is not loaded. */
export async function readImageAddress(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'images' LIMIT 1")
    .first<{ value: string }>();
  if (!row) return '';
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return '';
    const address = (parsed as { address?: unknown }).address;
    return typeof address === 'string' ? address.trim() : '';
  } catch {
    return '';
  }
}

export const PAYMENT_QR_MAX_BYTES = 1024 * 1024;

export function paymentQrKey(wallet: 'bkash' | 'nagad', extension: string): string {
  return `payment-qr/${wallet}-${crypto.randomUUID()}.${extension}`;
}

export function paymentQrUrl(key: string, publicUrl: string): string {
  const base = publicUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/${key}` : `/img/${key}`;
}

export function paymentQrKeyFromUrl(value: string): string | null {
  const pathname = (() => {
    try {
      return new URL(value, 'https://local.invalid').pathname;
    } catch {
      return value;
    }
  })();
  const direct = pathname
    .replace(/^\/+/, '')
    .replace(/^img\//, '')
    .match(/^(payment-qr\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp))$/);
  return direct?.[1] ?? null;
}

export type QrImageType = 'png' | 'jpg' | 'webp';

/** Detects PNG, JPEG, or WebP from magic bytes; never trusts the file name. */
export function detectImageType(bytes: Uint8Array): QrImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function brandKeyFromLogoUrl(value: string): string | null {
  const pathname = (() => {
    try {
      return new URL(value, 'https://local.invalid').pathname;
    } catch {
      return value;
    }
  })();
  const match = pathname.match(/\/img\/(brand\/[A-Za-z0-9_-]+\.webp)$/);
  if (match?.[1]) return match[1];
  const direct = pathname.replace(/^\/+/, '').match(/^(brand\/[A-Za-z0-9_-]+\.webp)$/);
  return direct?.[1] ?? null;
}

export function isWebPBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

const IMAGE_KEY_PATTERN =
  /^products\/\d+\/[A-Za-z0-9_-]+-(?:thumb|md|full)\.webp$/;
const BRAND_KEY_PATTERN = /^brand\/[A-Za-z0-9_-]+\.webp$/;
const PAYMENT_QR_KEY_PATTERN =
  /^payment-qr\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp)$/;

export function isValidImageKey(key: string): boolean {
  return (
    IMAGE_KEY_PATTERN.test(key) ||
    BRAND_KEY_PATTERN.test(key) ||
    PAYMENT_QR_KEY_PATTERN.test(key)
  );
}
