/**
 * IPC Handlers
 * Aggregate domain-specific IPC registrations.
 */

import { createWindowSenderHelpers } from './ipc/common';
import { registerRecoveryHandlers } from './ipc/recovery';
import { registerWindowHandlers } from './ipc/window';
import { registerTerminalHandlers } from './ipc/terminal';
import { registerWorkspaceHandlers } from './ipc/workspace';
import { registerRegistryHandlers } from './ipc/registry';
import { registerOrchestratorHandlers } from './ipc/orchestrator';
import { registerAgentSessionHandlers } from './ipc/agentSession';

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
