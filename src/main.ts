// @ts-nocheck
/**
 * Agent-Office — Main Process Orchestrator
 * Module initialization, event wiring, and app lifecycle management
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const AgentManager = require('./agentManager');
const SessionScanner = require('./sessionScanner');
const HeatmapScanner = require('./heatmap');
const { adaptAgentToDashboard } = require('./dashboardAdapter');
const errorHandler = require('./errorHandler');
const { getWindowSizeForAgents } = require('./utils');

const { getEnabledProviders } = require('./main/providerConfig');
const { sessionPids, startLivenessChecker, detectClaudePidByTranscript, detectProviderPidBySessionFile } = require('./main/livenessChecker');
const { registerIpcHandlers } = require('./main/ipcHandlers');
const { NicknameStore } = require('./main/nicknameStore');
const { TerminalManager } = require('./main/terminalManager');
const { TerminalProfileService } = require('./main/terminalProfileService');
const { AgentRegistry } = require('./main/registry');
const { WorkspaceManager } = require('./main/workspace');
const { TaskStore } = require('./main/orchestrator/taskStore');
const { Orchestrator } = require('./main/orchestrator/index');
const { TeamStore } = require('./main/orchestrator/teamStore');
const { TeamCoordinator } = require('./main/orchestrator/teamCoordinator');
const {
  configureApplicationMenu,
  configureRuntime,
  installStartupLogging,
} = require('./main/bootstrap/runtime');
const {
  autoRegisterProviders,
  createProviderProcessors,
  startProviderServices,
} = require('./main/bootstrap/providers');
const {
  attachAgentBroadcasts,
  createApplicationWindowManager,
  startDashboardRuntime,
} = require('./main/bootstrap/windows');
const {
  recoverProviderSessions,
  restoreRegisteredAgents,
} = require('./main/bootstrap/recovery');
const { registerAppLifecycle } = require('./main/bootstrap/shutdown');
const { loadUiState } = require('./main/uiState');

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

// Scan public/characters/ and regenerate avatars.json
function syncAvatarFiles() {
  const charDir = path.join(__dirname, '..', 'public', 'characters');
  const jsonPath = path.join(__dirname, '..', 'public', 'shared', 'avatars.json');
  try {
    const files = fs.readdirSync(charDir)
      .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
      .sort();
    if (files.length > 0) {
      fs.writeFileSync(jsonPath, JSON.stringify(files, null, 2) + '\n');
      debugLog(`[Main] avatars.json synced: ${files.length} files`);
    }
  } catch (e) {
    console.error('[Main] Failed to sync avatars.json:', e.message);
  }
}

app.whenReady().then(() => {
  syncAvatarFiles();
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
  ({
    hookProcessor,
    codexProcessor,
    codexSessionMonitor,
  } = createProviderProcessors({
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

  // 4.6. Create orchestrator and team coordinator
  taskStore = new TaskStore(debugLog);
  orchestrator = new Orchestrator({
    taskStore,
    terminalManager,
    workspaceManager,
    agentRegistry,
    agentManager,
    debugLog,
    maxConcurrentTasks: 5,
  });

  const teamStore = new TeamStore(debugLog);
  const teamCoordinator = new TeamCoordinator({
    teamStore,
    orchestrator,
    agentRegistry,
    agentManager,
    workspaceManager,
    debugLog,
  });

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
  startDashboardRuntime({ windowManager, orchestrator, workspaceManager, terminalManager, teamCoordinator, debugLog });

  // 6.5. Start orchestrator
  if (orchestrator) {
    orchestrator.start();
    debugLog('[Main] Orchestrator started');
  }

  if (enabledProviders.some((provider) => provider === 'claude' || provider === 'codex')) {
    livenessIntervals = startLivenessChecker({ agentManager, agentRegistry, taskStore, debugLog });
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

  // 8. Test agents (mix of Main, Sub, and Team)
  const ENABLE_TEST_AGENTS = false;
  if (ENABLE_TEST_AGENTS) {
    const testSubagents = [
      { sessionId: 'test-main-1', projectPath: 'E:/projects/core-engine', displayName: 'Main Service', state: 'Working', isSubagent: false, isTeammate: false },
      { sessionId: 'test-sub-1', projectPath: 'E:/projects/core-engine', displayName: 'Refactor Helper', state: 'Working', isSubagent: true, isTeammate: false },
      { sessionId: 'test-team-1', projectPath: 'E:/projects/web-ui', displayName: 'UI Architect', state: 'Waiting', isSubagent: false, isTeammate: true },
      { sessionId: 'test-team-2', projectPath: 'E:/projects/web-ui', displayName: 'CSS Specialist', state: 'Working', isSubagent: false, isTeammate: true }
    ];
    testSubagents.forEach(agent => agentManager.updateAgent(agent, 'test'));
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
  sessionPids,
  debugLog,
});
