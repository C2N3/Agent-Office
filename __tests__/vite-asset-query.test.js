import { hasViteAssetQuery } from '../scripts/vite-asset-query.ts';

describe('vite asset query detection', () => {
  test('treats Vite raw and import params as bundler-handled asset requests', () => {
    expect(hasViteAssetQuery(new URLSearchParams('import&raw'))).toBe(true);
    expect(hasViteAssetQuery(new URLSearchParams('url'))).toBe(true);
  });

  test('keeps normal runtime asset cache-busting params on the custom asset middleware', () => {
    expect(hasViteAssetQuery(new URLSearchParams('t=123456'))).toBe(false);
    expect(hasViteAssetQuery(new URLSearchParams('cache=no-store'))).toBe(false);
  });
});
