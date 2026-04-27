import type { DebugLog } from './types.js';

const PROTOCOL_VERSION = 1;

type ServerMessageOptions = {
  raw: any;
  workerId: string;
  debugLog: DebugLog;
  agentRegistry?: any;
  orchestrator?: any;
  bindTask?: (localTaskId: string, centralTaskId: string) => void;
  send: (payload: Record<string, unknown>) => void;
  unbindTask?: (localTaskId: string) => void;
};

export function handleServerMessage({ raw, workerId, debugLog, agentRegistry, orchestrator, bindTask, send, unbindTask }: ServerMessageOptions): void {
  let message: any = null;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw));
  } catch {
    debugLog('[CentralWorker] ignored non-JSON server message');
    return;
  }

  switch (message?.type) {
    case 'server.task.start':
      startCentralTask({ message, workerId, debugLog, agentRegistry, orchestrator, bindTask, send, unbindTask });
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

function startCentralTask(options: {
  message: any;
  workerId: string;
  debugLog: DebugLog;
  agentRegistry?: any;
  orchestrator?: any;
  bindTask?: (localTaskId: string, centralTaskId: string) => void;
  send: (payload: Record<string, unknown>) => void;
  unbindTask?: (localTaskId: string) => void;
}): void {
  const { message, workerId, debugLog, agentRegistry, orchestrator, bindTask, send, unbindTask } = options;
  const centralTaskId = String(message?.taskId || '');
  if (!centralTaskId) return;
  if (!orchestrator?.submitTask) {
    sendTaskFailed(send, workerId, centralTaskId, 'Central task bridge unavailable: orchestrator is not initialized');
    return;
  }

  try {
    const agentId = typeof message.agentId === 'string' ? message.agentId : '';
    const agent = agentId && agentRegistry?.getAgent ? agentRegistry.getAgent(agentId) : null;
    const localTask = orchestrator.submitTask({
      title: message.title || 'Central task',
      prompt: message.prompt || '',
      provider: agent?.provider || 'claude',
      executionEnvironment: 'native',
      model: agent?.model || null,
      maxTurns: 30,
      repositoryPath: agent?.workspace?.repositoryPath || agent?.projectPath || '',
      priority: 'normal',
      autoMergeOnSuccess: false,
      agentRegistryId: agentId || null,
    });
    if (!localTask?.id) {
      sendTaskFailed(send, workerId, centralTaskId, 'Central task bridge failed to create a local task');
      return;
    }
    bindTask?.(localTask.id, centralTaskId);

    const cleanup = () => {
      orchestrator.off?.('task:succeeded', onSucceeded);
      orchestrator.off?.('task:failed', onFailed);
      orchestrator.off?.('task:cancelled', onCancelled);
      unbindTask?.(localTask.id);
    };
    const matches = (task: any) => task?.id === localTask.id;
    const onSucceeded = (task: any) => {
      if (!matches(task)) return;
      send({
        type: 'worker.task.completed',
        workerId,
        protocolVersion: PROTOCOL_VERSION,
        taskId: centralTaskId,
        exitCode: task.exitCode || 0,
        timestamp: Date.now(),
      });
      cleanup();
    };
    const onFailed = (task: any) => {
      if (!matches(task)) return;
      sendTaskFailed(send, workerId, centralTaskId, task.errorMessage || 'Local task failed');
      cleanup();
    };
    const onCancelled = (task: any) => {
      if (!matches(task)) return;
      sendTaskFailed(send, workerId, centralTaskId, 'Local task cancelled');
      cleanup();
    };
    orchestrator.on?.('task:succeeded', onSucceeded);
    orchestrator.on?.('task:failed', onFailed);
    orchestrator.on?.('task:cancelled', onCancelled);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error || 'Central task bridge failed');
    debugLog(`[CentralWorker] server.task.start failed: ${messageText}`);
    sendTaskFailed(send, workerId, centralTaskId, messageText);
  }
}

function sendTaskFailed(send: (payload: Record<string, unknown>) => void, workerId: string, taskId: string, error: string): void {
  send({
    type: 'worker.task.failed',
    workerId,
    protocolVersion: PROTOCOL_VERSION,
    taskId,
    error,
    timestamp: Date.now(),
  });
}
