import { DOM } from './shared.js';

export function updateConnectionStatus(up: boolean) {
  const banner = document.getElementById('disconnectBanner');
  if (up) {
    DOM.statusIndicator.className = 'status-dot connected';
    DOM.connectionStatus.textContent = 'Gateway Online';
    if (banner) banner.style.display = 'none';
    return;
  }

  DOM.statusIndicator.className = 'status-dot disconnected';
  DOM.connectionStatus.textContent = 'Disconnected';
  if (banner) banner.style.display = 'block';
}
