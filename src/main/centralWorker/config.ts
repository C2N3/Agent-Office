import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';

export const DEFAULT_CENTRAL_SERVER_URL = 'http://127.0.0.1:47823';
export const CONFIG_DIR = path.join(os.homedir(), '.agent-office');
export const CENTRAL_SERVER_URL_FILE = path.join(CONFIG_DIR, 'central-server-url.txt');
export const CENTRAL_AGENT_SYNC_FILE = path.join(CONFIG_DIR, 'central-agent-sync.txt');
export const CENTRAL_WORKER_ENABLED_FILE = path.join(CONFIG_DIR, 'central-worker-enabled.txt');
export const CENTRAL_WORKER_TOKEN_FILE = path.join(CONFIG_DIR, 'central-worker-token.txt');
export const CENTRAL_WORKER_ID_FILE = path.join(CONFIG_DIR, 'central-worker-id.txt');

export type WorkerConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

type CentralServerConfigUpdate = {
  baseUrl?: string;
  agentSyncEnabled?: boolean;
  workerEnabled?: boolean;
  workerToken?: string;
};

let configuredBaseUrl: string | null = null;
let configuredAgentSyncEnabled: boolean | null = null;
let configuredWorkerEnabled: boolean | null = null;
let workerConnectionStatus: WorkerConnectionStatus = 'disconnected';

const configEvents = new EventEmitter();

export function normalizeCentralServerBaseUrl(raw: string): { ok: boolean; value?: string; message?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Server URL is required' };

  const candidate = /^\d{1,5}$/.test(trimmed)
    ? `http://127.0.0.1:${trimmed}`
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, message: 'Server URL must use http or https' };
    }
    if (!url.hostname) return { ok: false, message: 'Server URL must include a host' };
    return { ok: true, value: url.origin.replace(/\/+$/, '') };
  } catch {
    return { ok: false, message: 'Server URL is invalid' };
  }
}

export function getCentralServerBaseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl;

  try {
    if (fs.existsSync(CENTRAL_SERVER_URL_FILE)) {
      const saved = fs.readFileSync(CENTRAL_SERVER_URL_FILE, 'utf-8');
      const normalized = normalizeCentralServerBaseUrl(saved);
      if (normalized.ok && normalized.value) {
        configuredBaseUrl = normalized.value;
        return configuredBaseUrl;
      }
    }
  } catch {}

  const envUrl = process.env.AO_CENTRAL_SERVER_URL;
  if (envUrl) {
    const normalized = normalizeCentralServerBaseUrl(envUrl);
    if (normalized.ok && normalized.value) {
      configuredBaseUrl = normalized.value;
      return configuredBaseUrl;
    }
  }

  configuredBaseUrl = DEFAULT_CENTRAL_SERVER_URL;
  return configuredBaseUrl;
}

function readBooleanFile(filePath: string): boolean | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim() === 'true';
    }
  } catch {}
  return null;
}

function writeBooleanFile(filePath: string, enabled: boolean): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(filePath, `${enabled ? 'true' : 'false'}\n`, 'utf-8');
}

export function getAgentSyncEnabled(): boolean {
  if (configuredAgentSyncEnabled !== null) return configuredAgentSyncEnabled;
  configuredAgentSyncEnabled = readBooleanFile(CENTRAL_AGENT_SYNC_FILE) ?? false;
  return configuredAgentSyncEnabled;
}

export function getWorkerEnabled(): boolean {
  if (configuredWorkerEnabled !== null) return configuredWorkerEnabled;
  configuredWorkerEnabled = readBooleanFile(CENTRAL_WORKER_ENABLED_FILE) ?? false;
  return configuredWorkerEnabled;
}

export function getCentralWorkerToken(): string {
  const envToken = process.env.AO_CENTRAL_WORKER_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    if (fs.existsSync(CENTRAL_WORKER_TOKEN_FILE)) {
      return fs.readFileSync(CENTRAL_WORKER_TOKEN_FILE, 'utf-8').trim();
    }
  } catch {}
  return '';
}

export function isCentralWorkerTokenConfigured(): boolean {
  return getCentralWorkerToken().length > 0;
}

export function getOrCreateCentralWorkerId(randomId: () => string = randomUUID): string {
  try {
    if (fs.existsSync(CENTRAL_WORKER_ID_FILE)) {
      const saved = fs.readFileSync(CENTRAL_WORKER_ID_FILE, 'utf-8').trim();
      if (saved) return saved;
    }
  } catch {}

  const workerId = `worker_${randomId()}`;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CENTRAL_WORKER_ID_FILE, `${workerId}\n`, 'utf-8');
  return workerId;
}

export function getWorkerConnectionStatus(): WorkerConnectionStatus {
  return workerConnectionStatus;
}

export function setWorkerConnectionStatus(status: WorkerConnectionStatus): void {
  workerConnectionStatus = status;
}

export function saveCentralServerConfig(update: CentralServerConfigUpdate): void {
  if (update.baseUrl !== undefined) {
    const normalized = normalizeCentralServerBaseUrl(update.baseUrl);
    if (!normalized.ok || !normalized.value) {
      throw new Error(normalized.message || 'Server URL is invalid');
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_SERVER_URL_FILE, `${normalized.value}\n`, 'utf-8');
    configuredBaseUrl = normalized.value;
  }
  if (typeof update.agentSyncEnabled === 'boolean') {
    writeBooleanFile(CENTRAL_AGENT_SYNC_FILE, update.agentSyncEnabled);
    configuredAgentSyncEnabled = update.agentSyncEnabled;
  }
  if (typeof update.workerEnabled === 'boolean') {
    writeBooleanFile(CENTRAL_WORKER_ENABLED_FILE, update.workerEnabled);
    configuredWorkerEnabled = update.workerEnabled;
  }
  if (typeof update.workerToken === 'string' && update.workerToken.trim()) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_WORKER_TOKEN_FILE, `${update.workerToken.trim()}\n`, 'utf-8');
  }
  configEvents.emit('changed');
}

export function onCentralServerConfigChanged(listener: () => void): () => void {
  configEvents.on('changed', listener);
  return () => configEvents.off('changed', listener);
}
