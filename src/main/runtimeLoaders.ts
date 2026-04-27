type PackageRequire = (packageName: string) => unknown;

export function loadChildProcess(packageRequire: PackageRequire): typeof import('child_process') {
  return packageRequire('child_process') as typeof import('child_process');
}

export function loadPath(packageRequire: PackageRequire): typeof import('path') {
  return packageRequire('path') as typeof import('path');
}
