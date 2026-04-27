import { createRequire } from 'node:module';

type PackageRequire = (packageName: string) => unknown;
const packageRequire = createRequire(import.meta.url);

export function loadChildProcess(requirePackage: PackageRequire = packageRequire): typeof import('child_process') {
  return requirePackage('child_process') as typeof import('child_process');
}

export function loadPath(requirePackage: PackageRequire = packageRequire): typeof import('path') {
  return requirePackage('path') as typeof import('path');
}
