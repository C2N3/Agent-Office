import { refreshRemoteViewData } from './controller.js';
import { startCentralServerConnection, stopCentralServerConnection, subscribeCentralServerConnection } from '../serverConnection.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let centralConnectionCleanup: (() => void) | null = null;

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
  if (!centralConnectionCleanup) {
    centralConnectionCleanup = subscribeCentralServerConnection(() => {
      if (!isRemoteInputFocused()) {
        void renderRemoteView();
      }
    });
  }
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
  if (centralConnectionCleanup) {
    centralConnectionCleanup();
    centralConnectionCleanup = null;
  }
  stopCentralServerConnection();
}
