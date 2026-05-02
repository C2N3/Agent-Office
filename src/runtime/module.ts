import path from 'path';
import { fileURLToPath } from 'url';

type ModuleUrl = string | URL;

function normalizeComparablePath(filePath: string): string {
  const normalized = path.normalize(path.resolve(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function entrypointPath(argvPath: string): string {
  return argvPath.startsWith('file:')
    ? fileURLToPath(argvPath)
    : path.resolve(argvPath);
}

export function moduleFilename(moduleUrl: ModuleUrl): string {
  return fileURLToPath(moduleUrl);
}

export function moduleDirname(moduleUrl: ModuleUrl): string {
  return path.dirname(moduleFilename(moduleUrl));
}

export function resolveFromModule(moduleUrl: ModuleUrl, ...segments: string[]): string {
  return path.resolve(moduleDirname(moduleUrl), ...segments);
}

export function isDirectEntrypoint(moduleUrl: ModuleUrl, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;

  return normalizeComparablePath(moduleFilename(moduleUrl)) === normalizeComparablePath(entrypointPath(argvPath));
}
