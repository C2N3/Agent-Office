/**
 * Pixel Agent Desk — Main Process Orchestrator
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
let livenessIntervals = null;
let agentListeners = null;
let hookServer = null;
let codexEventServer = null;
let enabledProviders = [];

app.whenReady().then(() => {
  debugLog('========== Pixel Agent Desk started ==========');

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

  // 1. Start agent manager immediately
  agentManager = new AgentManager();
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
      sessionPids,
      debugLog,
      detectClaudePidByTranscript,
    });
  }
  if (enabledProviders.includes('codex')) {
    codexProcessor = createCodexProcessor({
      agentManager,
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
    sessionScanner,
    heatmapScanner,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    getWindowSizeForAgents,
  });

  // 5. Register IPC handlers
  registerIpcHandlers({
    agentManager,
    sessionPids,
    windowManager,
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

  // 9. Create UI
  windowManager.createWindow();
  windowManager.createDashboardWindow();

  // Send current state when renderer is ready
  ipcMain.once('renderer-ready', () => {
    debugLog('[Main] renderer-ready event received!');

    // Helper: send to main + dashboard windows, then persist state
    function broadcast(mainChannel, dashChannel, data, dashData) {
      const mw = windowManager.mainWindow;
      if (mw && !mw.isDestroyed()) mw.webContents.send(mainChannel, data);
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) dw.webContents.send(dashChannel, dashData !== undefined ? dashData : data);
      savePersistedState({ agentManager, sessionPids });
    }

    function closeDashboardIfEmpty() {
      if (agentManager.getAllAgents().length === 0) {
        windowManager.closeDashboardWindow();
      }
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
        closeDashboardIfEmpty();
      },
      onCleaned: (data) => {
        broadcast('agents-cleaned', 'dashboard-agent-removed', data, { type: 'batch', ...data });
        closeDashboardIfEmpty();
      }
    };

    agentManager.on('agent-added', agentListeners.onAdded);
    agentManager.on('agent-updated', agentListeners.onUpdated);
    agentManager.on('agent-removed', agentListeners.onRemoved);
    agentManager.on('agents-cleaned', agentListeners.onCleaned);

    // Send sessions that arrived before ready and recovered data
    const allAgents = agentManager.getAllAgents();
    if (allAgents.length > 0) {
      debugLog(`[Main] Sending ${allAgents.length} agents to newly ready renderer`);
      const mw = windowManager.mainWindow;
      allAgents.forEach(agent => {
        mw.webContents.send('agent-added', agent);
      });
      windowManager.resizeWindowForAgents(allAgents);
    }

    if (hookProcessor) hookProcessor.flushPendingStarts();
    if (codexProcessor) codexProcessor.flushPendingStarts();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createWindow();
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

  // Clean up all resources
  if (hookProcessor) hookProcessor.cleanup();
  if (codexProcessor) codexProcessor.cleanup();
  sessionPids.clear();

  debugLog('[Main] All resources cleaned up');
});
