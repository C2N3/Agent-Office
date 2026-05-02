
export function removeOrOffline(agentManager, agentRegistry, agent, debugLog) {
  if (agent.isRegistered) {
    const registryId = agent.registryId || agent.id;
    agentRegistry?.unlinkSession?.(registryId);
    agentManager.transitionToOffline(agent.id);
    debugLog(`[Live] ${agent.id.slice(0, 8)} (registered) → Offline`);
  } else {
    agentManager.removeAgent(agent.id);
  }
}

export function hasActiveOrchestratorTask(taskStore, agent) {
  if (!taskStore) return false;
  const registryId = agent.registryId || agent.id;
  const activeTasks = taskStore.getAllTasks
    ? taskStore.getAllTasks()
    : [];
  // Protect agents with running/provisioning tasks
  const hasRunning = activeTasks.some(t =>
    t.agentRegistryId === registryId &&
    (t.status === 'running' || t.status === 'provisioning' || t.status === 'retrying')
  );
  if (hasRunning) return true;

  // Protect agents in an active team
  if (agent.teamId && agent.isRegistered) return true;
  if (agent.state === 'Waiting' && agent.isRegistered) return true;

  return false;
}
