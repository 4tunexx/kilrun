import { describe, expect, it } from 'vitest';
import { resolveShopImageUrl } from './shop-images';

describe('resolveShopImageUrl', () => {
  it('returns null for empty values', () => {
    expect(resolveShopImageUrl(null)).toBeNull();
    expect(resolveShopImageUrl(undefined)).toBeNull();
    expect(resolveShopImageUrl('')).toBeNull();
    expect(resolveShopImageUrl('   ')).toBeNull();
  });

  it('passes through http(s) URLs', () => {
    expect(resolveShopImageUrl('https://cdn.example/hat.png')).toBe(
      'https://cdn.example/hat.png'
    );
  });

  it('passes through editor screenshot data URLs', () => {
    const data = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(resolveShopImageUrl(data)).toBe(data);
  });

  it('passes through local upload paths', () => {
    expect(resolveShopImageUrl('/uploads/site/misc-abc.png')).toBe(
      '/uploads/site/misc-abc.png'
    );
  });

  it('maps known /shop placeholders', () => {
    expect(resolveShopImageUrl('/shop/cape.png')).toContain('placehold.co');
    expect(resolveShopImageUrl('/shop/cape.png')).toContain('Cape');
  });

  it('falls back to Kilrun placeholder only for unknown non-path values', () => {
    const url = resolveShopImageUrl('broken-asset');
    expect(url).toContain('placehold.co');
    expect(url).toContain('Kilrun');
  });
});
