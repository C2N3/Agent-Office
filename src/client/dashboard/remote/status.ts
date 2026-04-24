import { type RemoteMode } from '../remoteMode.js';

type RemoteConfig = {
  baseUrl?: string;
  remoteMode?: RemoteMode;
  roomSecretConfigured?: boolean;
  workerTokenConfigured?: boolean;
  workerConnectionStatus?: string;
};

type RemoteHealth = {
  status: string;
  time: string;
};

type RemoteWorker = {
  id: string;
  displayName: string;
  hostname: string;
  platform: string;
  capabilities: string[];
  status: string;
  runningTasks: number;
};

export type RemoteSnapshot = {
  config: RemoteConfig | null;
  health: RemoteHealth | null;
  workers: RemoteWorker[];
  error: string | null;
  eventsConnected: boolean;
};
