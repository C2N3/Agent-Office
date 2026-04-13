
const { recoverExistingSessions } = require('../sessionPersistence');

function recoverProviderSessions({
  enabledProviders,
  agentManager,
  sessionPids,
  hookProcessor,
  codexProcessor,
  debugLog,
  errorHandler,
}) {
  if (enabledProviders.length === 0) {
    return;
  }

  recoverExistingSessions({
    agentManager,
    sessionPids,
    firstPreToolUseDone: hookProcessor?.firstPreToolUseDone,
    firstToolUseMaps: [codexProcessor?.firstToolUseDone].filter(Boolean),
    debugLog,
    errorHandler,
  });
}

function restoreRegisteredAgents({ agentRegistry, agentManager, debugLog }) {
  for (const regAgent of agentRegistry.getActiveAgents()) {
    const existing = agentManager.getAgent(regAgent.id);
    const hasLiveAttachedSession = existing && existing.isRegistered && existing.state !== 'Offline';

    if (regAgent.currentSessionId && !hasLiveAttachedSession) {
      agentRegistry.unlinkSession(regAgent.id);
    }
    if (hasLiveAttachedSession) continue;

    agentManager.updateAgent({
      registryId: regAgent.id,
      displayName: regAgent.name,
      role: regAgent.role,
      projectPath: regAgent.projectPath,
      avatarIndex: regAgent.avatarIndex,
      provider: regAgent.provider,
      workspace: regAgent.workspace || null,
      isRegistered: true,
      state: 'Offline',
    }, 'registry');
  }

  debugLog(`[Main] ${agentRegistry.getActiveAgents().length} registered agent(s) loaded`);
}

module.exports = {
  recoverProviderSessions,
  restoreRegisteredAgents,
};
