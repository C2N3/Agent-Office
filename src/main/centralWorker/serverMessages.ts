import type { DebugLog } from './types.js';

const PROTOCOL_VERSION = 1;

type ServerMessageOptions = {
  raw: any;
  workerId: string;
  debugLog: DebugLog;
  send: (payload: Record<string, unknown>) => void;
};

export function handleServerMessage({ raw, workerId, debugLog, send }: ServerMessageOptions): void {
  let message: any = null;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw));
  } catch {
    debugLog('[CentralWorker] ignored non-JSON server message');
    return;
  }

  switch (message?.type) {
    case 'server.task.start':
      debugLog('[CentralWorker] server.task.start is unsupported until task bridge is implemented');
      if (message.taskId) {
        send({
          type: 'worker.task.failed',
          workerId,
          protocolVersion: PROTOCOL_VERSION,
          taskId: message.taskId,
          error: 'Unsupported central task bridge: Agent-Office Electron client does not execute central tasks yet',
          timestamp: Date.now(),
        });
      }
      break;
    case 'server.task.cancel':
    case 'server.terminal.open':
    case 'server.terminal.input':
    case 'server.terminal.resize':
    case 'server.terminal.close':
    case 'server.git.merge':
      debugLog(`[CentralWorker] ${message.type} is unsupported in this MVP`);
      break;
    default:
      break;
  }
}
