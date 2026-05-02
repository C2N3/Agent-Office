import { state } from './shared';
import { notifyDashboardStore } from './state/store';

export function updateConnectionStatus(up: boolean) {
  state.connected = up;
  notifyDashboardStore();
}
