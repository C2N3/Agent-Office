import type { DashboardAgent } from './dashboard/shared';
import {
  initOffice,
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
} from './office/index';

let sseDelay = 1000;
let sseSource: EventSource | null = null;
const pipBridge = window as Window & {
  pipAPI?: {
    close?: () => void;
    backToDashboard?: () => void;
  };
};

function connectSSE() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }

  const eventSource = new EventSource('/api/events');
  sseSource = eventSource;

  eventSource.onerror = () => {
    eventSource.close();
    sseSource = null;
    console.warn('[PiP] SSE disconnected, retrying in', sseDelay, 'ms');
    setTimeout(connectSSE, sseDelay);
    sseDelay = Math.min(sseDelay * 2, 30000);
  };

  eventSource.addEventListener('connected', () => {
    sseDelay = 1000;
    fetch('/api/agents')
      .then((response) => response.json() as Promise<DashboardAgent[]>)
      .then((agents) => {
        agents.forEach((agent) => {
          officeOnAgentCreated(agent);
        });
      });
  });
  eventSource.addEventListener('agent.created', (event) => {
    officeOnAgentCreated(JSON.parse(event.data).data);
  });
  eventSource.addEventListener('agent.updated', (event) => {
    officeOnAgentUpdated(JSON.parse(event.data).data);
  });
  eventSource.addEventListener('agent.removed', (event) => {
    officeOnAgentRemoved(JSON.parse(event.data).data);
  });
}

function boot() {
  console.log('[PiP] boot start');
  initOffice().then(() => {
    const canvas = document.getElementById('office-canvas') as HTMLCanvasElement | null;
    console.log('[PiP] office initialized, canvas:', canvas?.width || 0, 'x', canvas?.height || 0);
    connectSSE();
  }).catch((error) => {
    console.error('[PiP] init failed:', error);
  });
}

document.getElementById('btnClose')?.addEventListener('click', () => {
  if (pipBridge.pipAPI?.close) pipBridge.pipAPI.close();
  else window.close();
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  if (pipBridge.pipAPI?.backToDashboard) pipBridge.pipAPI.backToDashboard();
  else window.close();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
