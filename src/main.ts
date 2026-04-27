/**
 * Agent-Office — Main Process Orchestrator
 * Module initialization, event wiring, and app lifecycle management
 */

import { app, BrowserWindow, Menu } from 'electron';

import { AgentManager } from './agentManager';
import { SessionScanner } from './sessionScanner';
import { HeatmapScanner } from './heatmap';
import { adaptAgentToDashboard } from './dashboardAdapter';
import errorHandler from './errorHandler';
import { getWindowSizeForAgents } from './utils';

import { getEnabledProviders } from './main/providerConfig';
import { providerSupportsLiveness } from './main/providers/registry';
import {
  sessionPids,
  startLivenessChecker,
  detectClaudePidByTranscript,
  detectProviderPidBySessionFile,
} from './main/livenessChecker';
import { registerIpcHandlers } from './main/ipcHandlers';
import { NicknameStore } from './main/nicknameStore';
import { TerminalManager } from './main/terminalManager';
import { TerminalProfileService } from './main/terminalProfileService';
import { AgentRegistry } from './main/registry';
import { CentralWorkerConnector } from './main/centralWorker/connector';
import { WorkspaceManager } from './main/workspace';
import { TaskStore } from './main/orchestrator/taskStore';
import { Orchestrator } from './main/orchestrator/index';
import { ProcessManager } from './main/orchestrator/processManager';
import { configureApplicationMenu, configureRuntime, installStartupLogging } from './main/bootstrap/runtime';
import {
  autoRegisterProviders,
  createProviderProcessors,
  startProviderServices,
} from './main/bootstrap/providers';
import {
  attachAgentBroadcasts,
  createApplicationWindowManager,
  startDashboardRuntime,
} from './main/bootstrap/windows';
import { recoverProviderSessions, restoreRegisteredAgents } from './main/bootstrap/recovery';
import { registerAppLifecycle } from './main/bootstrap/shutdown';
import { syncAvatarFiles } from './main/bootstrap/avatars';
import { registerTestAgents } from './main/bootstrap/testAgents';
import { loadUiState } from './main/uiState';

const { debugLog } = installStartupLogging({ app });

// =====================================================
// App configuration
// =====================================================
configureRuntime({ app });

// =====================================================
// App instances
// =====================================================
let agentManager = null;
let sessionScanner = null;
let heatmapScanner = null;
let windowManager = null;
let hookProcessor = null;
let codexProcessor = null;
let codexSessionMonitor = null;
let terminalManager = null;
let terminalProfileService = null;
let workspaceManager = null;
let taskStore = null;
let orchestrator = null;
let livenessIntervals = null;
let agentListeners = null;
let hookServer = null;
let codexEventServer = null;
let enabledProviders = [];
let centralWorkerConnector = null;

app.whenReady().then(async () => {
  syncAvatarFiles({ debugLog });
  debugLog('========== Agent-Office started ==========');

  const isDev = process.argv.includes('--dev');
  enabledProviders = getEnabledProviders();
  debugLog(`[Main] Providers enabled: ${enabledProviders.join(', ')}`);
  configureApplicationMenu({ Menu, isDev });

  // 0. Auto-register provider integrations
  autoRegisterProviders({ enabledProviders, debugLog });

  // 0.5. Nickname store + Agent registry
  const nicknameStore = new NicknameStore(debugLog);
  terminalProfileService = new TerminalProfileService(debugLog);
  const agentRegistry = new AgentRegistry(debugLog);
  workspaceManager = new WorkspaceManager({ debugLog });

  // 1. Start agent manager immediately
  agentManager = new AgentManager();
  agentManager.setNicknameStore(nicknameStore);
  agentManager.start();

  // 2. Start transcript scanners for enabled providers
  if (enabledProviders.length > 0) {
    sessionScanner = new SessionScanner(agentManager, debugLog);
    sessionScanner.start(60_000);
  }

  // 2.5. Start heatmap scanner
  heatmapScanner = new HeatmapScanner(debugLog);
  heatmapScanner.start(300_000);

  // 3. Create provider processors
  ({ hookProcessor, codexProcessor, codexSessionMonitor } = createProviderProcessors({
    enabledProviders,
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectClaudePidByTranscript,
    detectProviderPidBySessionFile,
  }));

  // 4. Create window manager
  windowManager = createApplicationWindowManager({
    agentManager,
    agentRegistry,
    sessionScanner,
    heatmapScanner,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    getWindowSizeForAgents,
  });

  // 4.5. Create terminal manager
  terminalManager = new TerminalManager({
    debugLog,
    getWindow: () => windowManager.dashboardWindow,
    terminalProfileService,
  });

  // 4.6. Create process manager for headless task execution
  const processManager = new ProcessManager({ debugLog });

  // 4.7. Create orchestrator and team coordinator
  taskStore = new TaskStore(debugLog);
  orchestrator = new Orchestrator({
    taskStore,
    terminalManager,
    processManager,
    workspaceManager,
    agentRegistry,
    agentManager,
    debugLog,
    maxConcurrentTasks: 5,
  });

  // Route provider completion events (Claude Stop hook, Codex task_complete,
  // session.end) into the orchestrator so it can end tasks based on the CLI's
  // own signal instead of guessing from TUI output.
  const completionHandler = (info: any) => orchestrator.handleProviderTaskComplete(info);
  if (hookProcessor && typeof (hookProcessor as any).setTaskCompletionHandler === 'function') {
    (hookProcessor as any).setTaskCompletionHandler(completionHandler);
  }
  if (codexProcessor && typeof (codexProcessor as any).setTaskCompletionHandler === 'function') {
    (codexProcessor as any).setTaskCompletionHandler(completionHandler);
  }

  // 5. Register IPC handlers
  registerIpcHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    windowManager,
    terminalManager,
    terminalProfileService,
    workspaceManager,
    nicknameStore,
    orchestrator,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    attachRegisteredAgent: (agent) => {
      const hookSessionId = hookProcessor?.attachRegisteredAgent ? hookProcessor.attachRegisteredAgent(agent) : null;
      const codexSessionId = codexProcessor?.attachRegisteredAgent ? codexProcessor.attachRegisteredAgent(agent) : null;
      return hookSessionId || codexSessionId || null;
    },
  });

  // 6. Start background services
  ({ hookServer, codexEventServer } = startProviderServices({
    hookProcessor,
    codexProcessor,
    codexSessionMonitor,
    debugLog,
    errorHandler,
  }));
  await startDashboardRuntime({
    windowManager,
    orchestrator,
    workspaceManager,
    terminalManager,
    sessionPids,
    debugLog,
    isDev,
  });

  // 6.5. Start orchestrator
  if (orchestrator) {
    orchestrator.start();
    debugLog('[Main] Orchestrator started');
  }

  if (enabledProviders.some((provider) => providerSupportsLiveness(provider))) {
    livenessIntervals = startLivenessChecker({ agentManager, agentRegistry, taskStore, terminalManager, debugLog });
  }

  // 7. Recover existing active sessions
  recoverProviderSessions({
    enabledProviders,
    agentManager,
    sessionPids,
    hookProcessor,
    codexProcessor,
    debugLog,
    errorHandler,
  });

  // 7.5. Populate offline registered agents
  restoreRegisteredAgents({ agentRegistry, agentManager, debugLog });

  centralWorkerConnector = new CentralWorkerConnector({
    agentRegistry,
    orchestrator,
    debugLog,
  });
  centralWorkerConnector.start();

  // 8. Test agents (mix of Main, Sub, and Team)
  const ENABLE_TEST_AGENTS = false;
  if (ENABLE_TEST_AGENTS) {
    registerTestAgents({ agentManager });
  }

  // 9. Create UI — only dashboard, no overlay window
  // windowManager.createWindow(); // Disabled: overlay replaced by dashboard Agent List
  windowManager.createDashboardWindow();

  // 9.5. Restore overlay if it was open at last shutdown
  const uiState = loadUiState();
  if (uiState.overlayOpen) {
    windowManager.createOverlayWindow();
    debugLog('[Main] Overlay restored from last session');
  }

  // Wire up agent event listeners immediately (no overlay window to wait for)
  agentListeners = attachAgentBroadcasts({
    agentManager,
    windowManager,
    sessionPids,
    adaptAgentToDashboard,
    hookProcessor,
    codexProcessor,
  });
}).catch((error) => {
  console.error('[Main] Failed during startup:', error);
  app.quit();
});

registerAppLifecycle({
  app,
  BrowserWindow,
  getAgentManager: () => agentManager,
  getAgentListeners: () => agentListeners,
  getLivenessIntervals: () => livenessIntervals,
  getSessionScanner: () => sessionScanner,
  getHeatmapScanner: () => heatmapScanner,
  getWindowManager: () => windowManager,
  getHookServer: () => hookServer,
  getCodexEventServer: () => codexEventServer,
  getCodexSessionMonitor: () => codexSessionMonitor,
  getOrchestrator: () => orchestrator,
  getTerminalManager: () => terminalManager,
  getHookProcessor: () => hookProcessor,
  getCodexProcessor: () => codexProcessor,
  getCentralWorkerConnector: () => centralWorkerConnector,
  sessionPids,
  debugLog,
});
