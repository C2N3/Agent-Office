type PackageRequire = NodeJS.Require;
type DashboardServerModule = typeof import('../dashboardServer/index.js');
type DashboardRemoteAuthModule = typeof import('../dashboardServer/remoteAuth.js');

function isMissingRequestedModule(error: any, specifier: string): boolean {
  return error?.code === 'MODULE_NOT_FOUND'
    && typeof error.message === 'string'
    && error.message.includes(`'${specifier}'`);
}

function loadRuntimeModule<T>(
  packageRequire: PackageRequire,
  runtimeSpecifier: string,
  sourceSpecifier: string,
): T {
  try {
    return packageRequire(runtimeSpecifier) as T;
  } catch (error) {
    if (!isMissingRequestedModule(error, runtimeSpecifier)) {
      throw error;
    }
    return packageRequire(sourceSpecifier) as T;
  }
}

export function loadDashboardServerModule(packageRequire: PackageRequire): DashboardServerModule {
  return loadRuntimeModule<DashboardServerModule>(
    packageRequire,
    '../../dashboardServer/index.js',
    '../../dashboardServer/index.ts',
  );
}

export function loadDashboardRemoteAuthModule(packageRequire: PackageRequire): DashboardRemoteAuthModule {
  return loadRuntimeModule<DashboardRemoteAuthModule>(
    packageRequire,
    '../../dashboardServer/remoteAuth.js',
    '../../dashboardServer/remoteAuth.ts',
  );
}
