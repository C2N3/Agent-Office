// @ts-nocheck

function removeOrOffline(agentManager, agentRegistry, agent, debugLog) {
  if (agent.isRegistered) {
    const registryId = agent.registryId || agent.id;
    agentRegistry?.unlinkSession?.(registryId);
    agentManager.transitionToOffline(agent.id);
    debugLog(`[Live] ${agent.id.slice(0, 8)} (registered) → Offline`);
  } else {
    agentManager.removeAgent(agent.id);
  }
}

function hasActiveOrchestratorTask(taskStore, agent) {
  if (!taskStore) return false;
  const registryId = agent.registryId || agent.id;
  const activeTasks = taskStore.getAllTasks
    ? taskStore.getAllTasks()
    : [];
  return activeTasks.some(t =>
    t.agentRegistryId === registryId &&
    (t.status === 'running' || t.status === 'provisioning' || t.status === 'retrying')
  );
}

module.exports = { hasActiveOrchestratorTask, removeOrOffline };
