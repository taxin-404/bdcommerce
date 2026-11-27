import { describe, expect, it } from 'vitest';
import {
  IMAGE_MAX_BYTES,
  imageBaseKey,
  imageUrl,
  imageVariantKey,
  isWebPBytes,
  isValidImageKey,
} from '../../src/lib/image';

describe('image keys', () => {
  it('builds a product base key', () => {
    expect(imageBaseKey(7, 'abc-123')).toBe('products/7/abc-123');
  });

  it('appends the size suffix', () => {
    expect(imageVariantKey('products/7/abc-123', 'thumb')).toBe(
      'products/7/abc-123-thumb.webp',
    );
    expect(imageVariantKey('products/7/abc-123', 'full')).toBe(
      'products/7/abc-123-full.webp',
    );
  });
});

describe('imageUrl', () => {
  it('uses the Worker fallback when no public URL is set', () => {
    expect(imageUrl('products/7/abc-123', 'md', '')).toBe(
      '/img/products/7/abc-123-md.webp',
    );
  });

  it('uses the configured public URL without doubling slashes', () => {
    expect(imageUrl('products/7/abc-123', 'full', 'https://img.example.com/')).toBe(
      'https://img.example.com/products/7/abc-123-full.webp',
    );
  });
});

describe('isWebPBytes', () => {
  it('accepts a RIFF/WEBP header', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);

    expect(isWebPBytes(bytes)).toBe(true);
  });

  it('rejects other formats and short buffers', () => {
    expect(isWebPBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isWebPBytes(new Uint8Array(12))).toBe(false);
  });
});

describe('isValidImageKey', () => {
  it('accepts generated product image keys', () => {
    expect(isValidImageKey('products/7/abc-123-thumb.webp')).toBe(true);
  });

  it('rejects traversal and unrelated keys', () => {
    expect(isValidImageKey('products/../secret-thumb.webp')).toBe(false);
    expect(isValidImageKey('snapshot/catalog.json')).toBe(false);
    expect(isValidImageKey('products/7/abc-123.webp')).toBe(false);
  });
});

it('has a one-megabyte per-file limit', () => {
  expect(IMAGE_MAX_BYTES).toBe(1024 * 1024);
});
