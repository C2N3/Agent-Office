import type { WorkerConnectionStatus } from './config.js';
import type { RegistryLike } from './agentPayload.js';

export type DebugLog = (message: string) => void;

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event?: any) => void) | null;
  onmessage: ((event: { data: any }) => void) | null;
  onclose: ((event?: any) => void) | null;
  onerror: ((event?: any) => void) | null;
};

export type WebSocketConstructor = new (url: string) => WebSocketLike;

export type ConnectorOptions = {
  agentRegistry?: RegistryLike | null;
  debugLog?: DebugLog;
  WebSocketImpl?: WebSocketConstructor;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  workerId?: string;
  getBaseUrl?: () => string;
  getToken?: () => string;
  getWorkerEnabled?: () => boolean;
  getAgentSyncEnabled?: () => boolean;
  onConfigChanged?: (listener: () => void) => () => void;
  setStatus?: (status: WorkerConnectionStatus) => void;
};
