type PackageRequire = NodeJS.Require;
type TunnelManagerModule = typeof import('../main/tunnelManager.js');

function isMissingRequestedModule(error: any, specifier: string): boolean {
  return error?.code === 'MODULE_NOT_FOUND'
    && typeof error.message === 'string'
    && error.message.includes(`'${specifier}'`);
}

function loadTunnelManagerModule(packageRequire: PackageRequire): TunnelManagerModule {
  try {
    return packageRequire('../main/tunnelManager.js') as TunnelManagerModule;
  } catch (error) {
    if (!isMissingRequestedModule(error, '../main/tunnelManager.js')) {
      throw error;
    }
    return packageRequire('../main/tunnelManager.ts') as TunnelManagerModule;
  }
}

export function loadMainTunnelManager(packageRequire: PackageRequire): any {
  return loadTunnelManagerModule(packageRequire).tunnelManager;
}
