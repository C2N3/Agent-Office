
import { dashboardResumeUtils, getDashboardAPI, state, termState } from '../shared';
import { getTerminalBootCommand } from '../providerCatalog';
import {
  activateTerminalTab,
  createXtermInstance,
  fitActiveTerminal,
  getTerminalOpenContext,
  initResizableHandles as initResizableHandlesHelper,
  renderTerminalTabs,
  resumeLatestRegisteredSession,
  closeTerminal,
} from './ui';
import {
  initTerminalProfileMenu as initTerminalProfileMenuHelper,
  closeTerminalProfileMenu,
  refreshTerminalProfiles,
} from './profiles';
import { setPsPolicyBlocked } from '../state/store';
import type { DashboardOpenOptions } from '../shared';

export function initTerminals() {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI) return;

  if (dashboardAPI.onTerminalData) {
    termState.dataCleanup = dashboardAPI.onTerminalData((agentId, data) => {
      const terminal = termState.terminals.get(agentId);
      if (terminal) {
        terminal.xterm.write(data);
      } else {
        if (!termState._pendingData) termState._pendingData = new Map();
        const buf = termState._pendingData;
        buf.set(agentId, (buf.get(agentId) || '') + data);
      }
    }) || null;
  }

  if (dashboardAPI.onTerminalExit) {
    termState.exitCleanup = dashboardAPI.onTerminalExit((agentId, exitCode) => {
      const terminal = termState.terminals.get(agentId);
      if (terminal) {
        terminal.xterm.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
        terminal.exited = true;
        renderTerminalTabs();
      }
    }) || null;
  }

  if (dashboardAPI.onPsPolicyBlocked) {
    dashboardAPI.onPsPolicyBlocked(() => {
      setPsPolicyBlocked(true);
    });
  }
}

export async function openTerminalForAgent(agentId: string, openOptions: DashboardOpenOptions = {}) {
  if (termState.terminals.has(agentId)) {
    activateTerminalTab(agentId);
    return;
  }

  const {
    agent,
    cwd,
    provider,
    agentStatus,
    registryId,
    isRegistered,
    directResumeSessionId,
  } = getTerminalOpenContext(agentId, openOptions);

  const dashboardAPI = getDashboardAPI();
  const isActive = ['working', 'thinking', 'waiting', 'help'].includes(agentStatus);
  let focusResult = null;
  if (isActive && !openOptions.forceTerminalTab) {
    if (!dashboardAPI?.focusAgent) return;
    focusResult = await dashboardAPI.focusAgent(agentId);
    if (focusResult?.success) return;
    if (focusResult?.reason !== 'stale-session') return;
  }

  const shouldAutoResume = dashboardResumeUtils.shouldAutoResumeRegisteredAgent
    ? dashboardResumeUtils.shouldAutoResumeRegisteredAgent(agent, openOptions)
    : (!openOptions.skipAutoResume && isRegistered && registryId && agentStatus === 'offline');
  const shouldRecoverStaleSession = !openOptions.skipAutoResume
    && isRegistered
    && registryId
    && focusResult?.reason === 'stale-session';

  if (shouldAutoResume || shouldRecoverStaleSession) {
    const resumeResult = await resumeLatestRegisteredSession(
      registryId,
      openOptions.label || agent?.nickname || agent?.name || 'Terminal',
      resumeRegisteredSession
    );
    if (resumeResult?.success) return;
    if (resumeResult?.attempted && !directResumeSessionId) {
      console.error('[Terminal] Resume failed:', resumeResult.error || 'unknown');
      alert(`Failed to resume the latest session: ${resumeResult.error || 'unknown'}`);
      return;
    }
  }

  if (!dashboardAPI?.createTerminal) return;
  const result = await dashboardAPI.createTerminal(agentId, {
    cwd,
    profileId: openOptions.profileId || undefined,
  });
  if (!result?.success) {
    console.error('[Terminal] Failed to create:', result?.error);
    return;
  }

  createXtermInstance(agentId, openOptions.label || agent?.nickname || agent?.name || result?.profileLabel || 'Terminal');
  const providerBootCommand = getTerminalBootCommand(provider, directResumeSessionId);
  if (providerBootCommand && dashboardAPI.writeTerminal && !openOptions.skipProviderBoot) {
    setTimeout(() => {
      dashboardAPI.writeTerminal(agentId, providerBootCommand);
    }, 250);
  }
}

export async function resumeRegisteredSession(registryId, sessionId, label) {
  if (!registryId || !sessionId) return { success: false, error: 'Missing session info' };
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.resumeSession) {
    return { success: false, error: 'Resume is only available in the Electron app' };
  }

  if (termState.terminals.has(registryId)) {
    closeTerminal(registryId);
  }

  const result = await dashboardAPI.resumeSession(registryId, sessionId);
  if (result?.success) {
    createXtermInstance(registryId, label || 'Terminal');
  }
  return result || { success: false, error: 'unknown' };
}

export function initTerminalProfileMenu() {
  closeTerminalProfileMenu();
  return initTerminalProfileMenuHelper();
}

export function initResizableHandles() {
  return initResizableHandlesHelper();
}

export function dismissPsPolicyBanner() {
  setPsPolicyBlocked(false);
}

export function openPsPolicyTerminal() {
  const dashboardAPI = getDashboardAPI();
  dashboardAPI?.openPsPolicyTerminal?.();
  setPsPolicyBlocked(false);
}

export {
  refreshTerminalProfiles,
  fitActiveTerminal,
};
