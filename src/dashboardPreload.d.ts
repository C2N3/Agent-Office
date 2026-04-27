import type { DashboardAPI as SharedDashboardAPI } from './shared/contracts/index';

export {};

declare global {
  interface DashboardAPI extends SharedDashboardAPI {}

  interface Window {
    dashboardAPI: SharedDashboardAPI;
  }
}
