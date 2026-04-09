import type { DashboardAPI as SharedDashboardAPI } from '../public/dashboard/shared.js';

export {};

declare global {
  interface DashboardAPI extends SharedDashboardAPI {}

  interface Window {
    dashboardAPI: SharedDashboardAPI;
  }
}
