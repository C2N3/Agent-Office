
import { dashboardResumeUtils, getDashboardAPI, SHARED_AVATAR_FILES, state, termState } from '../shared.js';
import { getTerminalBootCommand } from '../providerCatalog.js';
import {
  activateTerminalTab,
  createXtermInstance,
  fitActiveTerminal,
  getTerminalOpenContext,
  initResizableHandles as initResizableHandlesHelper,
  renderTerminalTabs,
  resumeLatestRegisteredSession,
  closeTerminal,
} from './ui.js';
import {
  initTerminalProfileMenu as initTerminalProfileMenuHelper,
  refreshTerminalProfiles,
} from './profiles.js';
import type { DashboardOpenOptions } from '../shared.js';

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
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'flex';
    });
    document.getElementById('psPolicyFixBtn')?.addEventListener('click', () => {
      dashboardAPI.openPsPolicyTerminal();
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
    });
    document.getElementById('psPolicyDismissBtn')?.addEventListener('click', () => {
      const banner = document.getElementById('psPolicyBanner');
      if (banner) banner.style.display = 'none';
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
  return initTerminalProfileMenuHelper(openTerminalForAgent);
}

export function initResizableHandles() {
  return initResizableHandlesHelper();
}

// ─── Task Chat UI (messenger-style log for headless tasks) ───

type TaskChatEntry = {
  chatEl: HTMLDivElement;
  element: HTMLDivElement;
  avatarFile: string;
  agentName: string;
  lastBubble: HTMLDivElement | null;
  lastType: string | null;
};

const taskChatMap = new Map<string, TaskChatEntry>();

/**
 * Open a messenger-style chat tab for a headless task.
 */
export function openTaskLogTab(taskId: string, agentRegistryId: string, label: string) {
  const tabId = `task-${taskId}`;

  if (termState.terminals.has(tabId)) {
    activateTerminalTab(tabId);
    return;
  }

  // Resolve agent avatar and name
  const agent = state.agents.get(agentRegistryId);
  const avatarIndex = agent?.avatarIndex != null ? agent.avatarIndex : 0;
  const avatarFile = SHARED_AVATAR_FILES[avatarIndex] || SHARED_AVATAR_FILES[0] || 'Origin/avatar_0.webp';
  const agentName = agent?.nickname || agent?.name || label || 'Agent';

  // Create chat container (replaces xterm)
  const container = document.getElementById('terminalContainer');
  const emptyState = document.getElementById('terminalEmptyState');
  if (emptyState) emptyState.style.display = 'none';

  const element = document.createElement('div');
  element.className = 'terminal-instance active';
  element.dataset.agentId = tabId;
  container!.appendChild(element);
  container!.querySelectorAll('.terminal-instance').forEach((inst) => {
    if (inst !== element) inst.classList.remove('active');
  });

  const chatEl = document.createElement('div');
  chatEl.className = 'task-chat-container';

  // Initial group with avatar
  const group = document.createElement('div');
  group.className = 'task-chat-group';
  group.innerHTML = `
    <div class="task-chat-avatar" style="background-image:url('./public/characters/${avatarFile}')"></div>
    <div class="task-chat-body">
      <div class="task-chat-name">${agentName}</div>
    </div>
  `;
  chatEl.appendChild(group);
  element.appendChild(chatEl);

  // Create tab via ui.ts helper
  // Store in termState with a dummy xterm-like object so closeTerminal works
  const dummyXterm = { dispose() {}, write() {}, writeln() {} };
  termState.terminals.set(tabId, {
    element,
    exited: false,
    fitAddon: null,
    label: label || 'Task',
    xterm: dummyXterm as any,
  });
  termState.activeId = tabId;
  renderTerminalTabs();

  // Store chat-specific state
  taskChatMap.set(taskId, {
    chatEl,
    element,
    avatarFile,
    agentName,
    lastBubble: null,
    lastType: null,
  });
}

/**
 * Append a message to the task chat UI.
 */
export function appendTaskChatMessage(taskId: string, data: { text: string; type: string; toolName?: string | null; merge?: boolean }) {
  const chat = taskChatMap.get(taskId);
  if (!chat) return;

  const body = chat.chatEl.querySelector('.task-chat-body') as HTMLDivElement;
  if (!body) return;

  if (data.type === 'tool_use') {
    // Tool use → separate line
    const toolEl = document.createElement('div');
    toolEl.className = 'task-chat-tool';
    toolEl.innerHTML = `<span class="task-chat-tool-icon">&gt;</span><span>${escapeHtml(data.text)}</span>`;
    body.appendChild(toolEl);
    chat.lastBubble = null;
    chat.lastType = 'tool_use';
  } else if (data.type === 'error' || data.type === 'context_exhaustion') {
    // Error → red line
    const errEl = document.createElement('div');
    errEl.className = 'task-chat-error';
    errEl.textContent = data.text;
    body.appendChild(errEl);
    chat.lastBubble = null;
    chat.lastType = 'error';
  } else {
    // Text → chat bubble (append to existing if consecutive)
    if (data.merge !== false && chat.lastType === 'text' && chat.lastBubble) {
      chat.lastBubble.textContent += '\n' + data.text;
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'task-chat-bubble';
      bubble.textContent = data.text;
      body.appendChild(bubble);
      chat.lastBubble = bubble;
    }
    chat.lastType = 'text';
  }

  // Auto-scroll to bottom
  chat.chatEl.scrollTop = chat.chatEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export {
  refreshTerminalProfiles,
  fitActiveTerminal,
};
