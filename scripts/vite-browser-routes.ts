export function resolveBrowserEntryPath(pathname: string): string | null {
  if (pathname === '/') return '/dashboard.html';
  if (pathname === '/pip') return '/pip.html';
  if (pathname === '/overlay') return '/overlay.html';
  return null;
}
