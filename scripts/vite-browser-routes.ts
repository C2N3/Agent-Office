import path from 'node:path';

export function resolveBrowserEntryPath(pathname: string): string | null {
  if (pathname === '/') return '/dashboard.html';
  if (pathname === '/pip') return '/pip.html';
  if (pathname === '/overlay') return '/overlay.html';
  if (pathname === '/task-chat') return '/taskChat.html';
  return null;
}

export function toViteFsPath(filePath: string): string {
  return `/@fs/${filePath.replace(/\\/g, '/')}`;
}

export function resolveBrowserSourceModuleFilePath(pathname: string, projectRoot: string): string | null {
  const match = /^\/(client|renderer|shared)\/(.+)$/.exec(pathname);
  if (!match) return null;

  const [, sourceArea, relativeModulePath] = match;
  const sourceRoot = path.join(projectRoot, 'src', sourceArea);
  const resolvedPath = path.resolve(sourceRoot, decodeURIComponent(relativeModulePath));
  const rel = path.relative(sourceRoot, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolvedPath;
}

export function resolveBrowserSourceModulePath(pathname: string, projectRoot: string): string | null {
  const sourceModuleFilePath = resolveBrowserSourceModuleFilePath(pathname, projectRoot);
  return sourceModuleFilePath ? toViteFsPath(sourceModuleFilePath) : null;
}
