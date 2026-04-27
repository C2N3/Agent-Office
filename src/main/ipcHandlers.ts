/**
 * IPC Handlers
 * Aggregate domain-specific IPC registrations.
 */

import { createWindowSenderHelpers } from './ipc/common.js';
import { registerRecoveryHandlers } from './ipc/recovery.js';
import { registerWindowHandlers } from './ipc/window.js';
import { registerTerminalHandlers } from './ipc/terminal.js';
import { registerWorkspaceHandlers } from './ipc/workspace.js';
import { registerRegistryHandlers } from './ipc/registry.js';
import { registerOrchestratorHandlers } from './ipc/orchestrator.js';
import { registerAgentSessionHandlers } from './ipc/agentSession.js';

function registerIpcHandlers({ agentManager, agentRegistry, sessionPids, windowManager, terminalManager, terminalProfileService, workspaceManager, nicknameStore, orchestrator, debugLog, adaptAgentToDashboard, errorHandler, attachRegisteredAgent }) {
  const senderHelpers = createWindowSenderHelpers({ windowManager });

  registerRecoveryHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    windowManager,
    terminalProfileService,
    debugLog,
    ...senderHelpers,
  });

  registerWindowHandlers({
    agentManager,
    windowManager,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
  });

  registerTerminalHandlers({
    agentManager,
    agentRegistry,
    terminalManager,
    terminalProfileService,
    nicknameStore,
    debugLog,
  });

  registerWorkspaceHandlers({
    agentManager,
    agentRegistry,
    terminalManager,
    workspaceManager,
    attachRegisteredAgent,
    debugLog,
    ...senderHelpers,
  });

  registerRegistryHandlers({
    agentManager,
    agentRegistry,
    terminalManager,
    debugLog,
    attachRegisteredAgent,
  });

  registerAgentSessionHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    terminalManager,
    orchestrator,
    debugLog,
  });

  registerOrchestratorHandlers({
    orchestrator,
  });
}

export { registerIpcHandlers };
