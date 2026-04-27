/**
 * IPC Handlers
 * Aggregate domain-specific IPC registrations.
 */

const { createWindowSenderHelpers } = require('./ipc/common');
const { registerRecoveryHandlers } = require('./ipc/recovery');
const { registerWindowHandlers } = require('./ipc/window');
const { registerTerminalHandlers } = require('./ipc/terminal');
const { registerWorkspaceHandlers } = require('./ipc/workspace');
import { registerRegistryHandlers } from './ipc/registry';
const { registerOrchestratorHandlers } = require('./ipc/orchestrator');
const { registerAgentSessionHandlers } = require('./ipc/agentSession');

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
