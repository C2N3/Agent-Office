import os from 'os';

const WORKER_CAPABILITIES = ['heartbeat:v1', 'agent-sync:v1', 'agent-office:electron-client'];

export function buildWorkerHello(workerId: string, protocolVersion: number): Record<string, unknown> {
  return {
    type: 'worker.hello',
    workerId,
    userId: 'local',
    displayName: os.hostname() || 'Agent-Office Client',
    hostname: os.hostname(),
    platform: `${process.platform}/${process.arch}`,
    protocolVersion,
    capabilities: WORKER_CAPABILITIES,
  };
}

export function buildWorkerHeartbeat(workerId: string, protocolVersion: number, runningTasks: number): Record<string, unknown> {
  return {
    type: 'worker.heartbeat',
    workerId,
    protocolVersion,
    runningTasks,
    timestamp: Date.now(),
  };
}
