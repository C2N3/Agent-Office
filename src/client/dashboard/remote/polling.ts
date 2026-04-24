import { refreshRemoteViewData } from './controller.js';
import { startCentralServerConnection, stopCentralServerConnection, subscribeCentralServerConnection } from '../serverConnection.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let centralConnectionCleanup: (() => void) | null = null;
let inFlightRender: Promise<void> | null = null;

function isRemoteInputFocused(): boolean {
  const focusedId = document.activeElement?.id;
  const focusedName = (document.activeElement as HTMLInputElement | null)?.name;
  return focusedId === 'centralServerUrlInput'
    || focusedId === 'guestInviteInput'
    || focusedName === 'remoteMode';
}

export async function renderRemoteView(): Promise<void> {
  if (inFlightRender) {
    await inFlightRender;
    return;
  }
  inFlightRender = refreshRemoteViewData().finally(() => {
    inFlightRender = null;
  });
  await inFlightRender;
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
    void renderRemoteView();
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
