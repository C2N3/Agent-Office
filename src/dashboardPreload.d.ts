import type { DashboardAPI as SharedDashboardAPI } from './shared/contracts/index.js';

export {};

declare global {
  interface DashboardAPI extends SharedDashboardAPI {}

  interface Window {
    dashboardAPI: SharedDashboardAPI;
  }
}
