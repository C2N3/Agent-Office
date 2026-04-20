import { refreshRemoteViewData } from './remote/controller.js';
import { startCentralServerConnection, stopCentralServerConnection } from './serverConnection.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;

function isRemoteInputFocused(): boolean {
  const focusedId = document.activeElement?.id;
  const focusedName = (document.activeElement as HTMLInputElement | null)?.name;
  return focusedId === 'centralServerUrlInput'
    || focusedId === 'guestInviteInput'
    || focusedName === 'remoteMode';
}

export async function renderRemoteView(): Promise<void> {
  if (!document.getElementById('remoteView')) return;
  await refreshRemoteViewData();
}

export function startRemoteViewPolling(): void {
  void startCentralServerConnection();
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (isRemoteInputFocused()) return;
    const remoteView = document.getElementById('remoteView');
    if (remoteView?.classList.contains('active') || remoteView?.closest('.view-section.active')) {
      void renderRemoteView();
    }
  }, 3000);
}

export function stopRemoteViewPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  stopCentralServerConnection();
}
