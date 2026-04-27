type PackageRequire = (packageName: string) => unknown;
type NodePtyModule = typeof import('node-pty');
type TreeKill = (pid: number, signal: string, callback?: (err?: Error) => void) => void;

function fallbackTreeKill(pid: number, signal: string, callback?: (err?: Error) => void): void {
  try {
    process.kill(pid, signal as any);
    callback?.();
  } catch (error: any) {
    callback?.(error);
  }
}

export function loadNodePty(packageRequire: PackageRequire): NodePtyModule {
  return packageRequire('node-pty') as NodePtyModule;
}

export function loadCloudflaredPackageBin(packageRequire: PackageRequire): string | null {
  const cloudflaredPackage = packageRequire('cloudflared') as { bin?: unknown };
  return typeof cloudflaredPackage.bin === 'string' ? cloudflaredPackage.bin : null;
}

export function loadTreeKill(packageRequire: PackageRequire): TreeKill {
  try {
    return packageRequire('tree-kill') as TreeKill;
  } catch {
    return fallbackTreeKill;
  }
}
