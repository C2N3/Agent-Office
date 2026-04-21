function normalizeAssetPath(assetPath: string): string {
  return String(assetPath || '')
    .replace(/^\/+/, '')
    .replace(/^assets\//, '');
}

export function toHttpAssetPath(assetPath: string): string {
  return `/assets/${normalizeAssetPath(assetPath)}`;
}

export function toRelativeAssetPath(assetPath: string): string {
  return `./assets/${normalizeAssetPath(assetPath)}`;
}
