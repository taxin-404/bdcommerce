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

export function isValidImageKey(key: string): boolean {
  return IMAGE_KEY_PATTERN.test(key);
}
