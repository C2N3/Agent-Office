import { loadTreeKill } from './nativeDependencies.js';

const treeKill = loadTreeKill();

const ACTIVE_TASK_STATUSES = new Set(['running', 'provisioning', 'retrying']);
const noopDebugLog = (_message: string) => {};

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function collectAgentKeys(agentId, agent) {
  return uniqueValues([
    agentId,
    agent?.id,
    agent?.registryId,
    agent?.sessionId,
    agent?.runtimeSessionId,
    agent?.resumeSessionId,
  ]);
}

function killPid(pid, debugLog) {
  return new Promise((resolve) => {
    if (!pid || pid === process.pid) {
      resolve(false);
      return;
    }

    try {
      treeKill(Number(pid), 'SIGTERM', () => resolve(true));
    } catch (error: any) {
      debugLog(`[Terminate] PID kill failed pid=${pid}: ${error.message}`);
      resolve(false);
    }
  });
}

export async function terminateAgentSession({
  agentId,
  agentManager,
  agentRegistry,
  sessionPids,
  terminalManager,
  orchestrator,
  debugLog = noopDebugLog,
}) {
  const agent = agentManager?.getAgent?.(agentId) || null;
  if (!agent) {
    return { success: false, error: 'Agent not found' };
  }

  const registryId = agent.registryId || (agent.isRegistered ? agent.id : null);
  const keys = collectAgentKeys(agentId, agent);
  const actions = {
    cancelledTasks: 0,
    destroyedTerminal: false,
    killedPids: 0,
    offline: false,
    removed: false,
  };

  const tasks = orchestrator?.getAllTasks?.() || [];
  for (const task of tasks) {
    if (!registryId || task.agentRegistryId !== registryId || !ACTIVE_TASK_STATUSES.has(task.status)) continue;
    try {
      orchestrator.cancelTask(task.id);
      actions.cancelledTasks += 1;
    } catch (error: any) {
      debugLog(`[Terminate] Task cancel failed ${task.id}: ${error.message}`);
    }
  }

  const terminalId = registryId || agent.id;
  if (terminalId && terminalManager?.hasTerminal?.(terminalId)) {
    terminalManager.destroyTerminal(terminalId);
    actions.destroyedTerminal = true;
  }

  const pids = uniqueValues(keys.map((key) => sessionPids?.get?.(key)));
  for (const pid of pids) {
    const killed = await killPid(pid, debugLog);
    if (killed) actions.killedPids += 1;
  }
  keys.forEach((key) => sessionPids?.delete?.(key));

  if (registryId) {
    agentRegistry?.unlinkSession?.(registryId);
    if (agentManager?.transitionToOffline?.(agent.id)) {
      actions.offline = true;
    }
  } else if (agentManager?.removeAgent?.(agent.id)) {
    actions.removed = true;
  }

  debugLog(
    `[Terminate] Agent ${agent.id.slice(0, 8)} stopped `
    + `(tasks=${actions.cancelledTasks}, terminal=${actions.destroyedTerminal}, pids=${actions.killedPids})`,
  );

  return { success: true, actions };
}
