import { createRequire } from 'node:module';

type PackageRequire = (packageName: string) => unknown;
type NodePtyModule = typeof import('node-pty');
type TreeKill = (pid: number, signal: string, callback?: (err?: Error) => void) => void;
const packageRequire = createRequire(import.meta.url);

function fallbackTreeKill(pid: number, signal: string, callback?: (err?: Error) => void): void {
  try {
    process.kill(pid, signal as any);
    callback?.();
  } catch (error: any) {
    callback?.(error);
  }
}

export function loadNodePty(requirePackage: PackageRequire = packageRequire): NodePtyModule {
  return requirePackage('node-pty') as NodePtyModule;
}

export function loadCloudflaredPackageBin(requirePackage: PackageRequire = packageRequire): string | null {
  const cloudflaredPackage = requirePackage('cloudflared') as { bin?: unknown };
  return typeof cloudflaredPackage.bin === 'string' ? cloudflaredPackage.bin : null;
}

export function loadTreeKill(requirePackage: PackageRequire = packageRequire): TreeKill {
  try {
    return requirePackage('tree-kill') as TreeKill;
  } catch {
    return fallbackTreeKill;
  }
}
