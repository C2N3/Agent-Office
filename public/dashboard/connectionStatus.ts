import { state } from './shared.js';
import { notifyDashboardStore } from './state/store.js';

export function updateConnectionStatus(up: boolean) {
  state.connected = up;
  notifyDashboardStore();
}
