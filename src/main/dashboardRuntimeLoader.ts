type DashboardServerModule = typeof import('../dashboardServer/index.js');
type DashboardRemoteAuthModule = typeof import('../dashboardServer/remoteAuth.js');

export function loadDashboardServerModule(): Promise<DashboardServerModule> {
  return import('../dashboardServer/index.js');
}

export function loadDashboardRemoteAuthModule(): Promise<DashboardRemoteAuthModule> {
  return import('../dashboardServer/remoteAuth.js');
}
