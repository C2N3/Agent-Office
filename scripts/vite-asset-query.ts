const VITE_ASSET_QUERY_PARAMS = new Set([
  'import',
  'inline',
  'raw',
  'sharedworker',
  'url',
  'worker',
]);

export function hasViteAssetQuery(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (VITE_ASSET_QUERY_PARAMS.has(key)) {
      return true;
    }
  }

  return false;
}
