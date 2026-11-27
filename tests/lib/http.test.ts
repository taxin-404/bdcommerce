import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../src/lib/http';

function request(method: string, url: string, origin?: string): Request {
  return new Request(url, {
    method,
    headers: origin ? { origin } : {},
  });
}

describe('isAllowedOrigin', () => {
  it('allows safe methods without checking', () => {
    expect(isAllowedOrigin(request('GET', 'https://shop.example/api/admin/products'))).toBe(true);
    expect(
      isAllowedOrigin(request('GET', 'https://shop.example/api/admin/products', 'https://evil.example')),
    ).toBe(true);
  });

  it('allows mutating requests from the same origin', () => {
    expect(
      isAllowedOrigin(
        request('POST', 'https://shop.example/api/admin/products', 'https://shop.example'),
      ),
    ).toBe(true);
  });

  it('rejects mutating requests from another origin', () => {
    expect(
      isAllowedOrigin(
        request('POST', 'https://shop.example/api/admin/products', 'https://evil.example'),
      ),
    ).toBe(false);
  });

  it('allows non-browser clients that send no Origin', () => {
    expect(isAllowedOrigin(request('DELETE', 'https://shop.example/api/admin/products/1'))).toBe(
      true,
    );
  });

  it('rejects an unparsable Origin', () => {
    expect(
      isAllowedOrigin(request('POST', 'https://shop.example/api/admin/products', 'not a url')),
    ).toBe(false);
  });
});
