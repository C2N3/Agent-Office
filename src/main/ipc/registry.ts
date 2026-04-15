const fs = require('fs');
const { ipcMain } = require('electron');
const { parseConversation, getConversationSummary } = require('../conversationParser');
const { resolveResumeSessionId } = require('../sessionIdResolver');
const { resolveProjectPathForPlatform } = require('../../utils');
const { dashboardIpcChannels } = require('../../shared/contracts/ipc');
const { buildProviderResumeCommand } = require('../providers/registry');

function registerRegistryHandlers({
  agentManager,
  agentRegistry,
  terminalManager,
  debugLog,
  attachRegisteredAgent,
}) {
  if (!agentRegistry) {
    return;
  }

  function upsertOfflineRegisteredAgent(agent, source) {
    agentManager.updateAgent({
      registryId: agent.id,
      displayName: agent.name,
      role: agent.role,
      projectPath: agent.projectPath,
      avatarIndex: agent.avatarIndex,
      provider: agent.provider,
      workspace: agent.workspace || null,
      isRegistered: true,
      state: 'Offline',
    }, source);
  }

  function buildResumeCommand(provider, sessionId) {
    return buildProviderResumeCommand(provider, sessionId);
  }

  ipcMain.handle(dashboardIpcChannels.registryCreate, async (_event, data) => {
    const agent = agentRegistry.createAgent(data);
    const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(agent) : null;
    if (!attachedSessionId) {
      upsertOfflineRegisteredAgent(agent, 'registry');
    }
    return { success: true, agent };
  });

  ipcMain.handle(dashboardIpcChannels.registryList, async () => {
    return agentRegistry.getAllAgents();
  });

  ipcMain.handle(dashboardIpcChannels.registryUpdate, async (_event, registryId, fields) => {
    const updated = agentRegistry.updateAgent(registryId, fields);
    if (updated) {
      const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(updated) : null;
      const existing = agentManager.getAgent(registryId);
      if (existing) {
        agentManager.updateAgent({
          ...existing,
          registryId,
          displayName: updated.name,
          role: updated.role,
          projectPath: updated.projectPath,
          avatarIndex: updated.avatarIndex,
          workspace: updated.workspace || null,
        }, 'registry');
      } else if (!attachedSessionId) {
        upsertOfflineRegisteredAgent(updated, 'registry');
      }
    }
    return { success: !!updated, agent: updated };
  });

  ipcMain.handle(dashboardIpcChannels.registryListArchivedWorkspaces, async () => {
    return agentRegistry.getArchivedWorkspaceAgents();
  });

  ipcMain.handle(dashboardIpcChannels.registryListArchived, async () => {
    return agentRegistry.getArchivedAgents();
  });

  ipcMain.handle(dashboardIpcChannels.registryToggle, async (_event, registryId, enabled) => {
    agentRegistry.setEnabled(registryId, enabled);
    return { success: true };
  });

  ipcMain.handle(dashboardIpcChannels.registryArchive, async (_event, registryId) => {
    const result = agentRegistry.archiveAgent(registryId);
    if (result) {
      const existing = agentManager.getAgent(registryId);
      if (existing && existing.state === 'Offline') {
        agentManager.removeAgent(registryId);
      }
    }
    return { success: result };
  });

  ipcMain.handle(dashboardIpcChannels.registryDelete, async (_event, registryId) => {
    const result = agentRegistry.deleteAgent(registryId);
    if (result) {
      agentManager.removeAgent(registryId);
    }
    return { success: result };
  });

  ipcMain.handle(dashboardIpcChannels.registrySessionHistory, async (_event, registryId) => {
    const history = agentRegistry.getSessionHistory(registryId);
    return history.map((entry) => {
      const summary = entry.transcriptPath
        ? getConversationSummary(entry.transcriptPath)
        : null;
      return { ...entry, summary };
    });
  });

  ipcMain.handle(dashboardIpcChannels.registryConversation, async (_event, registryId, sessionId, options) => {
    const entry = agentRegistry.findSessionHistoryEntry(registryId, sessionId);

    let transcriptPath = entry ? entry.transcriptPath : null;
    if (!transcriptPath) {
      const agent = agentManager?.getAgent(registryId);
      if (agent && (agent.sessionId === sessionId || agent.runtimeSessionId === sessionId || agent.resumeSessionId === sessionId) && agent.jsonlPath) {
        transcriptPath = agent.jsonlPath;
      }
    }

    if (!transcriptPath) return { error: 'Transcript not found' };
    const result = parseConversation(transcriptPath, options || {});
    if (!result) return { error: 'Could not parse transcript' };
    return result;
  });

  ipcMain.handle(dashboardIpcChannels.registryResumeSession, async (_event, registryId, sessionId) => {
    if (!terminalManager) return { success: false, error: 'Terminal not available' };

    const agent = agentRegistry.getAgent(registryId);
    if (!agent) return { success: false, error: 'Agent not found' };
    const entry = agentRegistry.findSessionHistoryEntry(registryId, sessionId);

    let transcriptPath = entry?.transcriptPath || null;
    if (!transcriptPath) {
      const liveAgent = agentManager?.getAgent(registryId);
      if (liveAgent && (liveAgent.sessionId === sessionId || liveAgent.runtimeSessionId === sessionId || liveAgent.resumeSessionId === sessionId) && liveAgent.jsonlPath) {
        transcriptPath = liveAgent.jsonlPath;
      }
    }

    const requestedResumeSessionId = entry?.resumeSessionId || sessionId;

    // Compute cwd up front so the Claude resolver can scope the UUID lookup
    // to ~/.claude/projects/<encoded-cwd>/ and fall back to the latest session
    // in that directory if the requested UUID belongs to a previous workspace.
    const sourceCwd = agent.workspace?.worktreePath || agent.projectPath;
    let cwd = resolveProjectPathForPlatform(sourceCwd) || undefined;
    if (cwd) {
      try {
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
          cwd = sourceCwd && sourceCwd !== cwd && fs.existsSync(sourceCwd) && fs.statSync(sourceCwd).isDirectory()
            ? sourceCwd
            : undefined;
        }
      } catch {
        cwd = undefined;
      }
    }

    const resolvedSessionId = resolveResumeSessionId({
      provider: agent.provider,
      requestedSessionId: requestedResumeSessionId,
      transcriptPath,
      cwd,
    });

    const resumeCommand = buildResumeCommand(agent.provider, resolvedSessionId);
    if (!resumeCommand) return { success: false, error: 'Session not found' };

    if (resolvedSessionId && requestedResumeSessionId && resolvedSessionId !== requestedResumeSessionId) {
      debugLog(`[Registry] Resume fallback: ${requestedResumeSessionId.slice(0, 8)} -> ${resolvedSessionId.slice(0, 8)} (cwd: ${cwd || 'none'})`);
    }

    if (terminalManager.hasTerminal(registryId)) {
      terminalManager.destroyTerminal(registryId);
    }

    const result = terminalManager.createTerminal(registryId, { cwd });
    if (!result.success) return result;

    // Wait for first shell output before sending the command to avoid losing
    // the first character due to a race condition between pty spawn and write.
    let sent = false;
    const unsubscribe = terminalManager.tapOutput(registryId, () => {
      if (sent) return;
      sent = true;
      unsubscribe();
      setTimeout(() => {
        terminalManager.writeToTerminal(registryId, resumeCommand);
      }, 50);
    });
    // Fallback in case no output arrives (e.g. silent shell)
    setTimeout(() => {
      if (sent) return;
      sent = true;
      unsubscribe();
      terminalManager.writeToTerminal(registryId, resumeCommand);
    }, 2000);

    return { ...result, terminalId: registryId, sessionId: resolvedSessionId };
  });
}

module.exports = {
  registerRegistryHandlers,
};
