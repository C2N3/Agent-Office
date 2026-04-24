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
export const CENTRAL_ROOM_SECRET_FILE = path.join(CONFIG_DIR, 'central-room-secret.txt');
export const CENTRAL_ROOM_SECRET_ROLE_FILE = path.join(CONFIG_DIR, 'central-room-secret-role.txt');
export const CENTRAL_REMOTE_MODE_FILE = path.join(CONFIG_DIR, 'central-remote-mode.txt');

export type RemoteMode = 'local' | 'host' | 'guest';
type RoomSecretRole = Exclude<RemoteMode, 'local'> | '';

export type WorkerConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type CentralServerConfigUpdate = {
  baseUrl?: string;
  agentSyncEnabled?: boolean;
  workerEnabled?: boolean;
  workerToken?: string;
  roomSecret?: string;
  remoteMode?: RemoteMode;
};

let configuredBaseUrl: string | null = null;
let configuredAgentSyncEnabled: boolean | null = null;
let configuredWorkerEnabled: boolean | null = null;
let configuredRemoteMode: RemoteMode | null = null;
let configuredRoomSecret: string | null = null;
let configuredRoomSecretRole: RoomSecretRole | null = null;
let workerConnectionStatus: WorkerConnectionStatus = 'disconnected';

const configEvents = new EventEmitter();

function hasStoredRemoteMode(): boolean {
  try {
    return fs.existsSync(CENTRAL_REMOTE_MODE_FILE);
  } catch {}
  return false;
}

function deriveFlagsFromRemoteMode(
  mode: RemoteMode,
  options: { roomSecretConfigured?: boolean; workerTokenConfigured?: boolean } = {}
): { workerEnabled: boolean; agentSyncEnabled: boolean } {
  switch (mode) {
    case 'host':
      return options.roomSecretConfigured || options.workerTokenConfigured
        ? { workerEnabled: true, agentSyncEnabled: true }
        : { workerEnabled: false, agentSyncEnabled: false };
    case 'guest':
      return options.roomSecretConfigured
        ? { workerEnabled: true, agentSyncEnabled: true }
        : { workerEnabled: false, agentSyncEnabled: false };
    default:
      return { workerEnabled: false, agentSyncEnabled: false };
  }
}
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
  if (hasStoredRemoteMode()) {
    configuredAgentSyncEnabled = deriveFlagsFromRemoteMode(getRemoteMode(), {
      roomSecretConfigured: isCentralRoomSecretConfigured(),
      workerTokenConfigured: isCentralWorkerTokenConfigured(),
    }).agentSyncEnabled;
    return configuredAgentSyncEnabled;
  }
  configuredAgentSyncEnabled = readBooleanFile(CENTRAL_AGENT_SYNC_FILE) ?? false;
  return configuredAgentSyncEnabled;
}
export function getWorkerEnabled(): boolean {
  if (configuredWorkerEnabled !== null) return configuredWorkerEnabled;
  if (hasStoredRemoteMode()) {
    configuredWorkerEnabled = deriveFlagsFromRemoteMode(getRemoteMode(), {
      roomSecretConfigured: isCentralRoomSecretConfigured(),
      workerTokenConfigured: isCentralWorkerTokenConfigured(),
    }).workerEnabled;
    return configuredWorkerEnabled;
  }
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
function getCentralRoomSecretRole(): RoomSecretRole {
  if (configuredRoomSecretRole !== null) return configuredRoomSecretRole;
  try {
    if (fs.existsSync(CENTRAL_ROOM_SECRET_ROLE_FILE)) {
      const saved = fs.readFileSync(CENTRAL_ROOM_SECRET_ROLE_FILE, 'utf-8').trim();
      if (saved === 'host' || saved === 'guest') {
        configuredRoomSecretRole = saved;
        return configuredRoomSecretRole;
      }
    }
  } catch {}
  const remoteMode = getRemoteMode();
  configuredRoomSecretRole = remoteMode === 'host' || remoteMode === 'guest' ? remoteMode : '';
  return configuredRoomSecretRole;
}
export function getCentralRoomSecret(mode: RemoteMode = getRemoteMode()): string {
  if (configuredRoomSecret !== null) {
    const currentMode = getRemoteMode();
    const role = getCentralRoomSecretRole();
    if (mode === 'local') return configuredRoomSecret;
    if (role) return role === mode ? configuredRoomSecret : '';
    return currentMode !== 'local' && mode === currentMode ? configuredRoomSecret : '';
  }
  try {
    if (fs.existsSync(CENTRAL_ROOM_SECRET_FILE)) {
      configuredRoomSecret = fs.readFileSync(CENTRAL_ROOM_SECRET_FILE, 'utf-8').trim();
      const currentMode = getRemoteMode();
      const role = getCentralRoomSecretRole();
      if (mode === 'local') return configuredRoomSecret;
      if (role) return role === mode ? configuredRoomSecret : '';
      return currentMode !== 'local' && mode === currentMode ? configuredRoomSecret : '';
    }
  } catch {}
  configuredRoomSecret = '';
  return '';
}
export function isCentralWorkerTokenConfigured(): boolean {
  return getCentralWorkerToken().length > 0;
}

export function isCentralRoomSecretConfigured(mode: RemoteMode = getRemoteMode()): boolean {
  return getCentralRoomSecret(mode).length > 0;
}
export function getRemoteMode(): RemoteMode {
  if (configuredRemoteMode) return configuredRemoteMode;
  try {
    if (fs.existsSync(CENTRAL_REMOTE_MODE_FILE)) {
      const saved = fs.readFileSync(CENTRAL_REMOTE_MODE_FILE, 'utf-8').trim();
      if (saved === 'host' || saved === 'guest' || saved === 'local') {
        configuredRemoteMode = saved;
        return configuredRemoteMode;
      }
    }
  } catch {}
  configuredRemoteMode = 'local';
  return configuredRemoteMode;
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
  const previousMode = getRemoteMode();
  const nextMode = update.remoteMode ?? getRemoteMode();
  const hasAmbiguousLegacyRoomSecret = update.roomSecret === undefined
    && previousMode === 'local'
    && nextMode !== 'local'
    && getCentralRoomSecret('local').trim().length > 0
    && getCentralRoomSecretRole() === '';
  if (hasAmbiguousLegacyRoomSecret) {
    configuredRoomSecret = '';
    if (fs.existsSync(CENTRAL_ROOM_SECRET_FILE)) fs.unlinkSync(CENTRAL_ROOM_SECRET_FILE);
  }
  const effectiveRoomSecret = update.roomSecret !== undefined ? update.roomSecret.trim() : getCentralRoomSecret(nextMode).trim();
  const effectiveWorkerToken = update.workerToken !== undefined ? update.workerToken.trim() : getCentralWorkerToken().trim();
  const derivedFlags =
    update.remoteMode !== undefined
      ? deriveFlagsFromRemoteMode(update.remoteMode, {
          roomSecretConfigured: effectiveRoomSecret.length > 0,
          workerTokenConfigured: effectiveWorkerToken.length > 0,
        })
      : null;

  if (update.baseUrl !== undefined) {
    const normalized = normalizeCentralServerBaseUrl(update.baseUrl);
    if (!normalized.ok || !normalized.value) {
      throw new Error(normalized.message || 'Server URL is invalid');
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_SERVER_URL_FILE, `${normalized.value}\n`, 'utf-8');
    configuredBaseUrl = normalized.value;
  }
  const nextAgentSyncEnabled = derivedFlags?.agentSyncEnabled ?? update.agentSyncEnabled;
  if (typeof nextAgentSyncEnabled === 'boolean') {
    writeBooleanFile(CENTRAL_AGENT_SYNC_FILE, nextAgentSyncEnabled);
    configuredAgentSyncEnabled = nextAgentSyncEnabled;
  }
  const nextWorkerEnabled = derivedFlags?.workerEnabled ?? update.workerEnabled;
  if (typeof nextWorkerEnabled === 'boolean') {
    writeBooleanFile(CENTRAL_WORKER_ENABLED_FILE, nextWorkerEnabled);
    configuredWorkerEnabled = nextWorkerEnabled;
  }
  if (typeof update.workerToken === 'string' && update.workerToken.trim()) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_WORKER_TOKEN_FILE, `${update.workerToken.trim()}\n`, 'utf-8');
  }
  if (typeof update.roomSecret === 'string') {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    configuredRoomSecret = update.roomSecret.trim();
    if (configuredRoomSecret) {
      fs.writeFileSync(CENTRAL_ROOM_SECRET_FILE, `${configuredRoomSecret}\n`, 'utf-8');
      configuredRoomSecretRole = nextMode === 'host' || nextMode === 'guest' ? nextMode : '';
      if (configuredRoomSecretRole) {
        fs.writeFileSync(CENTRAL_ROOM_SECRET_ROLE_FILE, `${configuredRoomSecretRole}\n`, 'utf-8');
      }
    } else if (fs.existsSync(CENTRAL_ROOM_SECRET_FILE)) {
      fs.unlinkSync(CENTRAL_ROOM_SECRET_FILE);
      configuredRoomSecretRole = '';
      if (fs.existsSync(CENTRAL_ROOM_SECRET_ROLE_FILE)) fs.unlinkSync(CENTRAL_ROOM_SECRET_ROLE_FILE);
    }
  }
  if (update.remoteMode !== undefined) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CENTRAL_REMOTE_MODE_FILE, `${update.remoteMode}\n`, 'utf-8');
    configuredRemoteMode = update.remoteMode;
  }
  configEvents.emit('changed');
}
export function onCentralServerConfigChanged(listener: () => void): () => void {
  configEvents.on('changed', listener);
  return () => configEvents.off('changed', listener);
}
