import os from 'os';
import {
  getAgentSyncEnabled,
  getCentralServerBaseUrl,
  getCentralRoomSecret,
  getCentralWorkerToken,
  getOrCreateCentralWorkerId,
  getRemoteMode,
  getWorkerEnabled,
  onCentralServerConfigChanged,
  setWorkerConnectionStatus,
  type RemoteMode,
  type WorkerConnectionStatus,
} from './config.js';
import {
  buildAgentUpsertPayload,
  isActiveAgent,
  type AgentRecord,
  type RegistryLike,
} from './agentPayload.js';
import { resolveWorkerConnectionAuth } from './connectionAuth.js';
import { registerConnectorRegistryListeners, unregisterConnectorRegistryListeners } from './registryListeners.js';
import { centralHttpUrlToWorkerWebSocketUrl } from './url.js';
import { handleServerMessage } from './serverMessages.js';
import type { ConnectorOptions, DebugLog, WebSocketLike, WebSocketConstructor } from './types.js';

export { centralHttpUrlToWorkerWebSocketUrl } from './url.js';

const PROTOCOL_VERSION = 1;
const HEARTBEAT_INTERVAL_MS = 5_000;
const RECONNECT_DELAY_MS = 3_000;
const WORKER_CAPABILITIES = ['heartbeat:v1', 'agent-sync:v1', 'agent-office:electron-client'];

export class CentralWorkerConnector {
  private readonly agentRegistry: RegistryLike | null;
  private readonly debugLog: DebugLog;
  private readonly WebSocketImpl?: WebSocketConstructor;
  private readonly heartbeatIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly workerId: string;
  private readonly getBaseUrl: () => string;
  private readonly getToken: () => string;
  private readonly getRoomSecret: () => string;
  private readonly getRemoteMode: () => RemoteMode;
  private readonly shouldConnect: () => boolean;
  private readonly shouldSyncAgents: () => boolean;
  private readonly onConfigChanged: (listener: () => void) => () => void;
  private readonly setStatus: (status: WorkerConnectionStatus) => void;

  private socket: WebSocketLike | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeConfig: (() => void) | null = null;
  private registryListeners: Array<[string, (...args: any[]) => void]> = [];
  private stopped = true;
  private intentionalClose = false;

  constructor(options: ConnectorOptions = {}) {
    this.agentRegistry = options.agentRegistry || null;
    this.debugLog = options.debugLog || (() => {});
    this.WebSocketImpl = options.WebSocketImpl || (globalThis.WebSocket as any);
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
    this.workerId = options.workerId || getOrCreateCentralWorkerId();
    this.getBaseUrl = options.getBaseUrl || getCentralServerBaseUrl;
    this.getToken = options.getToken || getCentralWorkerToken;
    this.getRoomSecret = options.getRoomSecret || getCentralRoomSecret;
    this.getRemoteMode = options.getRemoteMode || getRemoteMode;
    this.shouldConnect = options.getWorkerEnabled || getWorkerEnabled;
    this.shouldSyncAgents = options.getAgentSyncEnabled || getAgentSyncEnabled;
    this.onConfigChanged = options.onConfigChanged || onCentralServerConfigChanged;
    this.setStatus = options.setStatus || setWorkerConnectionStatus;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.registerRegistryListeners();
    this.unsubscribeConfig = this.onConfigChanged(() => this.restartFromConfig());
    this.reconcileConnection();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = null;
    this.unregisterRegistryListeners();
    this.clearReconnectTimer();
    this.closeSocket('disconnected');
  }

  getWorkerId(): string {
    return this.workerId;
  }

  sendAgentSnapshot(): void {
    if (!this.shouldSyncAgents()) return;
    const agents = this.agentRegistry?.getActiveAgents?.() || [];
    for (const agent of agents) {
      this.sendAgentUpsert(agent);
    }
  }

  private registerRegistryListeners(): void {
    this.registryListeners = registerConnectorRegistryListeners(
      this.agentRegistry,
      (agent) => this.sendAgentUpsert(agent),
      (agentId) => this.sendAgentRemove(agentId),
    );
  }

  private unregisterRegistryListeners(): void {
    unregisterConnectorRegistryListeners(this.agentRegistry, this.registryListeners);
    this.registryListeners = [];
  }

  private restartFromConfig(): void {
    this.clearReconnectTimer();
    if (!this.shouldConnect()) {
      this.closeSocket('disconnected');
      return;
    }
    this.closeSocket('connecting');
    this.connect();
  }

  private reconcileConnection(): void {
    if (this.stopped || !this.shouldConnect()) {
      this.closeSocket('disconnected');
      return;
    }
    this.connect();
  }

  private connect(reconnecting = false): void {
    if (this.stopped || !this.shouldConnect()) return;
    if (!this.WebSocketImpl) {
      this.debugLog('[CentralWorker] WebSocket is not available in this runtime');
      this.setStatus('error');
      return;
    }

    const remoteMode = this.getRemoteMode();
    const baseUrl = this.getBaseUrl();
    const auth = resolveWorkerConnectionAuth({
      remoteMode,
      token: this.getToken(),
      roomSecret: this.getRoomSecret(),
      baseUrl,
    });
    if (auth.error === 'baseUrl required') {
      this.setStatus('error');
      return;
    }
    if (auth.error) {
      this.debugLog(`[CentralWorker] ${auth.error}`);
      this.setStatus('error');
      return;
    }
    const participantId = remoteMode === 'guest' ? this.workerId : '';
    const url = centralHttpUrlToWorkerWebSocketUrl(baseUrl, auth.token, auth.roomSecret, participantId);
    this.intentionalClose = false;
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting');

    try {
      const socket = new this.WebSocketImpl(url);
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.setStatus('connected');
        this.sendHello();
        this.sendHeartbeat();
        this.startHeartbeatTimer();
        this.sendAgentSnapshot();
      };
      socket.onmessage = (event) => handleServerMessage({
        raw: event.data,
        workerId: this.workerId,
        debugLog: this.debugLog,
        send: (payload) => this.send(payload),
      });
      socket.onerror = () => {
        if (this.socket === socket) this.setStatus('error');
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        this.clearHeartbeatTimer();
        if (this.stopped || this.intentionalClose || !this.shouldConnect()) {
          this.setStatus('disconnected');
          return;
        }
        this.scheduleReconnect();
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'connect failed');
      this.debugLog(`[CentralWorker] connect failed: ${message}`);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped || !this.shouldConnect()) return;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(true);
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startHeartbeatTimer(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }

  private clearHeartbeatTimer(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private closeSocket(status: WorkerConnectionStatus): void {
    this.intentionalClose = true;
    this.clearHeartbeatTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      } catch {}
    }
    this.setStatus(status);
  }

  private isSocketOpen(): boolean {
    return this.socket?.readyState === 1;
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.isSocketOpen()) return;
    this.socket?.send(JSON.stringify(payload));
  }

  private sendHello(): void {
    this.send({
      type: 'worker.hello',
      workerId: this.workerId,
      userId: 'local',
      displayName: os.hostname() || 'Agent-Office Client',
      hostname: os.hostname(),
      platform: `${process.platform}/${process.arch}`,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: WORKER_CAPABILITIES,
    });
  }

  private sendHeartbeat(): void {
    this.send({
      type: 'worker.heartbeat',
      workerId: this.workerId,
      protocolVersion: PROTOCOL_VERSION,
      runningTasks: 0,
      timestamp: Date.now(),
    });
  }

  private sendAgentUpsert(agent: AgentRecord): void {
    if (!this.shouldSyncAgents() || !isActiveAgent(agent)) return;
    this.send(buildAgentUpsertPayload(agent, this.workerId));
  }

  private sendAgentRemove(agentId: string): void {
    if (!this.shouldSyncAgents()) return;
    this.send({
      type: 'agent.remove',
      workerId: this.workerId,
      protocolVersion: PROTOCOL_VERSION,
      agentId,
      timestamp: Date.now(),
    });
  }
}
