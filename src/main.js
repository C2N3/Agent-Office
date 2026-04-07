/**
 * Agent-Office — Main Process Orchestrator
 * Module initialization, event wiring, and app lifecycle management
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const AgentManager = require('./agentManager');
const SessionScanner = require('./sessionScanner');
const HeatmapScanner = require('./heatmapScanner');
const { adaptAgentToDashboard } = require('./dashboardAdapter');
const errorHandler = require('./errorHandler');
const { getWindowSizeForAgents } = require('./utils');

const { HOOK_SERVER_PORT, registerClaudeHooks } = require('./main/hookRegistration');
const { startHookServer } = require('./main/hookServer');
const { createHookProcessor } = require('./main/hookProcessor');
const { CODEX_EVENT_SERVER_PORT, startCodexEventServer } = require('./main/codexEventServer');
const { createCodexProcessor } = require('./main/codexProcessor');
const { createCodexSessionMonitor } = require('./main/codexSessionMonitor');
const { getEnabledProviders } = require('./main/providerConfig');
const { sessionPids, startLivenessChecker, detectClaudePidByTranscript } = require('./main/livenessChecker');
const { savePersistedState, recoverExistingSessions } = require('./main/sessionPersistence');
const { createWindowManager } = require('./main/windowManager');
const { registerIpcHandlers } = require('./main/ipcHandlers');
const { NicknameStore } = require('./main/nicknameStore');
const { TerminalManager } = require('./main/terminalManager');
const { TerminalProfileService } = require('./main/terminalProfileService');
const { AgentRegistry } = require('./main/agentRegistry');

// =====================================================
// Save error logs to file
// =====================================================
const logDir = app.isPackaged ? app.getPath('userData') : __dirname;
const errorLogPath = path.join(logDir, 'startup-error.log');
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { process.stderr.write(`[log-write-error] ${e.message}\n`); }

  originalConsoleError.apply(console, args);
};

// Global error handler
process.on('uncaughtException', (error) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`;
  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { process.stderr.write(`[log-write-error] ${e.message}\n`); }
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] UNHANDLED REJECTION: ${reason}\n`;
  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { process.stderr.write(`[log-write-error] ${e.message}\n`); }
});

// Debug logging to file
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(path.join(logDir, 'debug.log'), logMsg);
  console.log(msg);
};

// =====================================================
// App configuration
// =====================================================
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
process.env.ELECTRON_DISABLE_LOGGING = '1';

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
let livenessIntervals = null;
let agentListeners = null;
let hookServer = null;
let codexEventServer = null;
let enabledProviders = [];

app.whenReady().then(() => {
  debugLog('========== Agent-Office started ==========');

  // Minimal application menu (removes default File/Edit/Window/Help clutter)
  const isDev = process.argv.includes('--dev');
  enabledProviders = getEnabledProviders();
  debugLog(`[Main] Providers enabled: ${enabledProviders.join(', ')}`);
  const menuTemplate = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // 0. Auto-register provider integrations
  if (enabledProviders.includes('claude')) {
    registerClaudeHooks(debugLog);
  }

  // 0.5. Nickname store + Agent registry
  const nicknameStore = new NicknameStore(debugLog);
  terminalProfileService = new TerminalProfileService(debugLog);
  const agentRegistry = new AgentRegistry(debugLog);

  // 1. Start agent manager immediately
  agentManager = new AgentManager();
  agentManager.setNicknameStore(nicknameStore);
  agentManager.start();

  // 2. Start Claude-only scanners
  if (enabledProviders.includes('claude')) {
    sessionScanner = new SessionScanner(agentManager, debugLog);
    sessionScanner.start(60_000);
  }

  // 2.5. Start heatmap scanner
  heatmapScanner = new HeatmapScanner(debugLog);
  heatmapScanner.start(300_000);

  // 3. Create provider processors
  if (enabledProviders.includes('claude')) {
    hookProcessor = createHookProcessor({
      agentManager,
      agentRegistry,
      sessionPids,
      debugLog,
      detectClaudePidByTranscript,
    });
  }
  if (enabledProviders.includes('codex')) {
    codexProcessor = createCodexProcessor({
      agentManager,
      agentRegistry,
      sessionPids,
      debugLog,
    });
    codexSessionMonitor = createCodexSessionMonitor({
      codexProcessor,
      agentManager,
      debugLog,
    });
  }

  // 4. Create window manager
  windowManager = createWindowManager({
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

  // 5. Register IPC handlers
  registerIpcHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    windowManager,
    terminalManager,
    terminalProfileService,
    nicknameStore,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
  });

  // 6. Start background services
  if (hookProcessor) {
    hookServer = startHookServer({
      processHookEvent: hookProcessor.processHookEvent,
      debugLog,
      HOOK_SERVER_PORT,
      errorHandler,
    });
  }
  if (codexProcessor) {
    codexEventServer = startCodexEventServer({
      processCodexEvent: codexProcessor.processCodexEvent,
      debugLog,
      errorHandler,
      port: CODEX_EVENT_SERVER_PORT,
    });
  }
  if (codexSessionMonitor) {
    codexSessionMonitor.start();
  }
  windowManager.startDashboardServer();
  if (enabledProviders.includes('claude')) {
    livenessIntervals = startLivenessChecker({ agentManager, debugLog });
  }

  // 7. Recover existing active sessions
  if (hookProcessor) {
    recoverExistingSessions({
      agentManager,
      sessionPids,
      firstPreToolUseDone: hookProcessor.firstPreToolUseDone,
      debugLog,
      errorHandler,
    });
  }

  // 7.5. Populate offline registered agents
  // Clear stale session links from previous run
  for (const regAgent of agentRegistry.getActiveAgents()) {
    if (regAgent.currentSessionId) {
      agentRegistry.unlinkSession(regAgent.id);
    }
    agentManager.updateAgent({
      registryId: regAgent.id,
      displayName: regAgent.name,
      role: regAgent.role,
      projectPath: regAgent.projectPath,
      avatarIndex: regAgent.avatarIndex,
      provider: regAgent.provider,
      isRegistered: true,
      state: 'Offline',
      tokenUsage: regAgent.cumulativeTokens || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
    }, 'registry');
  }
  debugLog(`[Main] ${agentRegistry.getActiveAgents().length} registered agent(s) loaded`);

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

  // Wire up agent event listeners immediately (no overlay window to wait for)
  {
    function broadcast(mainChannel, dashChannel, data, dashData) {
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) dw.webContents.send(dashChannel, dashData !== undefined ? dashData : data);
      savePersistedState({ agentManager, sessionPids });
    }

    agentListeners = {
      onAdded: (agent) => {
        broadcast('agent-added', 'dashboard-agent-added', agent, adaptAgentToDashboard(agent));
      },
      onUpdated: (agent) => {
        broadcast('agent-updated', 'dashboard-agent-updated', agent, adaptAgentToDashboard(agent));
      },
      onRemoved: (data) => {
        broadcast('agent-removed', 'dashboard-agent-removed', data);
      },
      onCleaned: (data) => {
        broadcast('agents-cleaned', 'dashboard-agent-removed', data, { type: 'batch', ...data });
      }
    };

    agentManager.on('agent-added', agentListeners.onAdded);
    agentManager.on('agent-updated', agentListeners.onUpdated);
    agentManager.on('agent-removed', agentListeners.onRemoved);
    agentManager.on('agents-cleaned', agentListeners.onCleaned);

    if (hookProcessor) hookProcessor.flushPendingStarts();
    if (codexProcessor) codexProcessor.flushPendingStarts();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createDashboardWindow();
  });
});

app.on('window-all-closed', () => {
  if (agentManager) agentManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Remove agentManager event listeners
  if (agentManager && agentListeners) {
    agentManager.removeListener('agent-added', agentListeners.onAdded);
    agentManager.removeListener('agent-updated', agentListeners.onUpdated);
    agentManager.removeListener('agent-removed', agentListeners.onRemoved);
    agentManager.removeListener('agents-cleaned', agentListeners.onCleaned);
    agentListeners = null;
  }

  if (agentManager) agentManager.stop();

  // Clear liveness checker intervals
  if (livenessIntervals) {
    clearInterval(livenessIntervals.zombieSweepId);
    clearInterval(livenessIntervals.livenessCheckId);
    livenessIntervals = null;
    debugLog('[Main] Liveness intervals cleared');
  }

  if (sessionScanner) {
    sessionScanner.stop();
    debugLog('[Main] SessionScanner stopped');
  }
  if (heatmapScanner) {
    heatmapScanner.stop();
    debugLog('[Main] HeatmapScanner stopped');
  }
  if (windowManager) {
    windowManager.closeDashboardWindow();
    windowManager.stopDashboardServer();
    windowManager.stopKeepAlive();
  }

  if (hookServer) {
    hookServer.close();
    hookServer = null;
  }
  if (codexEventServer) {
    codexEventServer.close();
    codexEventServer = null;
  }
  if (codexSessionMonitor) {
    codexSessionMonitor.stop();
    codexSessionMonitor = null;
  }

  // Clean up terminals
  if (terminalManager) {
    terminalManager.destroyAll();
    debugLog('[Main] TerminalManager cleaned up');
  }

  // Clean up all resources
  if (hookProcessor) hookProcessor.cleanup();
  if (codexProcessor) codexProcessor.cleanup();
  sessionPids.clear();

  debugLog('[Main] All resources cleaned up');
});
