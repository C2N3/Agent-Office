type DashboardServerModule = typeof import('../dashboardServer/index');
type DashboardRemoteAuthModule = typeof import('../dashboardServer/remoteAuth');

export function loadDashboardServerModule(): Promise<DashboardServerModule> {
  return import('../dashboardServer/index');
}

export function loadDashboardRemoteAuthModule(): Promise<DashboardRemoteAuthModule> {
  return import('../dashboardServer/remoteAuth');
}
