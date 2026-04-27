import fs from 'fs';
import { ipcMain } from 'electron';
import { resolveResumeSessionId } from '../sessionIdResolver.js';
import { resolveProjectPathForPlatform } from '../../utils.js';
import { electronIpcChannels, dashboardIpcChannels } from '../../shared/contracts/ipc.js';
import {
  buildResumeCommand,
  findLatestResumableSessionEntry,
  focusTerminalByPid,
  isPidAlive,
} from './recoveryHelpers.js';
import { launchExternalResumeTerminal } from './recovery/launch.js';

const STALE_FOCUS_REPAIR_MS = 10_000;

export function registerRecoveryHandlers({
  agentManager,
  agentRegistry,
  sessionPids,
  windowManager,
  terminalProfileService,
  debugLog,
  isMainWindowSender,
}) {
  function canRecoverFocusedRegisteredAgent(agent) {
    if (!agent?.isRegistered || !agentRegistry) return false;

    const registryId = agent.registryId || agent.id;
    const registryAgent = agentRegistry.getAgent?.(registryId);
    if (!registryAgent) return false;

    if (
      agent.sessionId
      || agent.runtimeSessionId
      || agent.resumeSessionId
      || registryAgent.currentSessionId
      || registryAgent.currentRuntimeSessionId
      || registryAgent.currentResumeSessionId
    ) {
      return true;
    }

    const history = agentRegistry.getSessionHistory?.(registryId) || [];
    return history.some((entry) => entry?.resumeSessionId || entry?.sessionId || entry?.runtimeSessionId);
  }

  function resolveFocusContext(agentId) {
    const agent = agentManager?.getAgent(agentId) || null;
    const candidateKeys = Array.from(new Set([
      agentId,
      agent?.sessionId,
      agent?.runtimeSessionId,
      agent?.resumeSessionId,
    ].filter(Boolean)));

    for (const key of candidateKeys) {
      const pid = sessionPids.get(key);
      if (pid) {
        return { agent, pid, pidKey: key, candidateKeys };
      }
    }

    return { agent, pid: null, pidKey: null, candidateKeys };
  }

  function repairStaleFocusedAgent(agentId, label) {
    const agent = agentManager?.getAgent(agentId);
    if (!agent) return 'no-pid';

    const candidateKeys = [
      agent.id,
      agent.sessionId,
      agent.runtimeSessionId,
      agent.resumeSessionId,
    ].filter(Boolean);
    candidateKeys.forEach((key) => sessionPids.delete(key));

    if (agent.isRegistered) {
      const registryId = agent.registryId || agent.id;
      agentRegistry?.unlinkSession?.(registryId);
      if (agent.state !== 'Offline') {
        agentManager?.transitionToOffline?.(agent.id);
      }
      debugLog(`[${label}] Focus: stale registered agent=${agent.id.slice(0, 8)} -> Offline`);
      return 'stale-session';
    }

    agentManager?.removeAgent?.(agent.id);
    debugLog(`[${label}] Focus: removed stale ephemeral agent=${agent.id.slice(0, 8)}`);
    return 'stale-session';
  }

  function resolveRegisteredResumeTarget(agent) {
    if (!agent?.isRegistered || !agentRegistry) {
      return { success: false, error: 'Agent is not resumable' };
    }

    const registryId = agent.registryId || agent.id;
    const registryAgent = agentRegistry.getAgent?.(registryId);
    if (!registryAgent) {
      return { success: false, error: 'Registered agent not found' };
    }

    const history = agentRegistry.getSessionHistory?.(registryId) || [];
    const candidateSessionIds = [
      agent.resumeSessionId,
      agent.sessionId,
      agent.runtimeSessionId,
      registryAgent.currentResumeSessionId,
      registryAgent.currentSessionId,
      registryAgent.currentRuntimeSessionId,
    ].filter(Boolean);

    let entry = null;
    for (const sessionId of candidateSessionIds) {
      entry = agentRegistry.findSessionHistoryEntry?.(registryId, sessionId) || null;
      if (entry) break;
    }

    if (!entry) {
      entry = findLatestResumableSessionEntry(history);
    }

    const transcriptPath = entry?.transcriptPath || agent.jsonlPath || null;
    const requestedResumeSessionId = entry?.resumeSessionId
      || entry?.sessionId
      || entry?.runtimeSessionId
      || agent.resumeSessionId
      || agent.sessionId
      || registryAgent.currentResumeSessionId
      || registryAgent.currentSessionId
      || registryAgent.currentRuntimeSessionId
      || null;

    const provider = registryAgent.provider || agent.provider || null;

    const sourceCwd = registryAgent.workspace?.worktreePath || registryAgent.projectPath;
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
      provider,
      requestedSessionId: requestedResumeSessionId,
      transcriptPath,
      sessionRoots: null,
      cwd,
    });
    const resumeCommand = buildResumeCommand(provider, resolvedSessionId);
    if (!resumeCommand) {
      return { success: false, error: 'Session not found' };
    }

    if (resolvedSessionId && requestedResumeSessionId && resolvedSessionId !== requestedResumeSessionId) {
      debugLog(`[Recovery] Resume fallback: ${requestedResumeSessionId.slice(0, 8)} -> ${resolvedSessionId.slice(0, 8)} (cwd: ${cwd || 'none'})`);
    }

    return {
      success: true,
      registryId,
      provider,
      cwd,
      sessionId: resolvedSessionId,
      resumeCommand,
    };
  }

  async function attemptRegisteredAgentResume(event, agentId, agent, label) {
    if (!isMainWindowSender(event)) {
      return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
    }

    const resumeTarget = resolveRegisteredResumeTarget(agent);
    if (!resumeTarget.success) {
      debugLog(`[${label}] Resume target error for agent=${agentId.slice(0, 8)}: ${resumeTarget.error}`);
      return { success: false, reason: 'resume-failed', error: resumeTarget.error };
    }

    repairStaleFocusedAgent(agentId, label);

    try {
      const launchResult = await launchExternalResumeTerminal({
        cwd: resumeTarget.cwd,
        resumeCommand: resumeTarget.resumeCommand,
        terminalProfileService,
      });
      if (!launchResult.success) {
        debugLog(`[${label}] External resume launch failed for agent=${agentId.slice(0, 8)}: ${launchResult.error}`);
        return { success: false, reason: 'resume-failed', error: launchResult.error || 'unknown' };
      }

      debugLog(`[${label}] External resume launched for agent=${agentId.slice(0, 8)} session=${resumeTarget.sessionId.slice(0, 8)}`);
      return { success: true, reason: 'resumed' };
    } catch (error) {
      debugLog(`[${label}] External resume error for agent=${agentId.slice(0, 8)}: ${error.message}`);
      return { success: false, reason: 'resume-failed', error: error.message };
    }
  }

  async function focusAgentTerminal(event, agentId, label) {
    const { agent, pid, candidateKeys } = resolveFocusContext(agentId);
    if (!pid) {
      if (canRecoverFocusedRegisteredAgent(agent)) {
        debugLog(`[${label}] Focus: missing PID for recoverable registered agent=${agentId.slice(0, 8)}`);
        return attemptRegisteredAgentResume(event, agentId, agent, label);
      }
      const agentAge = Date.now() - Number(agent?.firstSeen || 0);
      if (agent && agentAge >= STALE_FOCUS_REPAIR_MS) {
        return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
      }
      debugLog(`[${label}] Focus: no PID for agent=${agentId.slice(0, 8)}`);
      return { success: false, reason: 'no-pid' };
    }

    if (!isPidAlive(pid)) {
      candidateKeys.forEach((key) => sessionPids.delete(key));
      debugLog(`[${label}] Focus: dead PID for agent=${agentId.slice(0, 8)} pid=${pid}`);
      if (canRecoverFocusedRegisteredAgent(agent)) {
        return attemptRegisteredAgentResume(event, agentId, agent, label);
      }
      return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
    }

    debugLog(`[${label}] Focus requested for agent=${agentId.slice(0, 8)} pid=${pid}`);
    focusTerminalByPid(pid, label, debugLog);
    return { success: true };
  }

  ipcMain.handle(electronIpcChannels.focusTerminal, async (event, agentId) => {
    return focusAgentTerminal(event, agentId, 'Main');
  });

  ipcMain.handle(electronIpcChannels.executeRecoveryAction, async () => ({ success: true }));

  ipcMain.on(dashboardIpcChannels.dashboardFocusAgent, async (event, agentId) => {
    await focusAgentTerminal(event, agentId, 'Dashboard');
  });

  return {
    focusAgentTerminal,
  };
}
