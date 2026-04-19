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
const { providerSupportsLiveness } = require('./main/providers/registry');
const { sessionPids, startLivenessChecker, detectClaudePidByTranscript, detectProviderPidBySessionFile } = require('./main/livenessChecker');
const { registerIpcHandlers } = require('./main/ipcHandlers');
const { NicknameStore } = require('./main/nicknameStore');
const { TerminalManager } = require('./main/terminalManager');
const { TerminalProfileService } = require('./main/terminalProfileService');
const { AgentRegistry } = require('./main/registry');
const { CentralWorkerConnector } = require('./main/centralWorker/connector');
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
let centralWorkerConnector = null;

// Scan public/characters/ subfolders and update avatars.json.
// Preserves the existing file order — new files are appended to the end
// so that previously assigned avatarIndex values remain valid.
function syncAvatarFiles() {
  const charDir = path.join(__dirname, '..', 'public', 'characters');
  const jsonPath = path.join(__dirname, '..', 'public', 'shared', 'avatars.json');
  const imgRegex = /\.(webp|png|jpg|jpeg|gif)$/i;
  try {
    // Load existing JSON to preserve current order
    let existingAllFiles: string[] = [];
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      existingAllFiles = Array.isArray(existing) ? existing : (existing.allFiles || []);
    } catch (_) { /* file missing or invalid — start fresh */ }

    // Collect all files currently on disk (sorted within each folder)
    const entries = fs.readdirSync(charDir, { withFileTypes: true });
    const diskFiles: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const folderFiles = fs.readdirSync(path.join(charDir, entry.name))
        .filter(f => imgRegex.test(f))
        .sort();
      diskFiles.push(...folderFiles.map(f => `${entry.name}/${f}`));
    }

    if (diskFiles.length === 0) return;

    // Build final list: keep existing order, append genuinely new files at the end
    const diskSet = new Set(diskFiles);
    const kept = existingAllFiles.filter(f => diskSet.has(f));
    const keptSet = new Set(kept);
    const added = diskFiles.filter(f => !keptSet.has(f));
    const allFiles = [...kept, ...added];

    // Rebuild categories from allFiles order
    const categoryMap = new Map<string, string[]>();
    for (const f of allFiles) {
      const folder = f.split('/')[0];
      if (!categoryMap.has(folder)) categoryMap.set(folder, []);
      categoryMap.get(folder)!.push(f);
    }
    const categories = Array.from(categoryMap.entries()).map(([name, files]) => ({ name, files }));

    fs.writeFileSync(jsonPath, JSON.stringify({ categories, allFiles }, null, 2) + '\n');
    debugLog(`[Main] avatars.json synced: ${allFiles.length} files (${added.length} new) in ${categories.length} categories`);
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

  // 4.6. Create process manager for headless task execution
  const { ProcessManager } = require('./main/orchestrator/processManager');
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

  const teamStore = new TeamStore(debugLog);
  const teamCoordinator = new TeamCoordinator({
    teamStore,
    terminalManager,
    processManager,
    agentRegistry,
    agentManager,
    workspaceManager,
    debugLog,
  });
  orchestrator.teamCoordinator = teamCoordinator;

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
  startDashboardRuntime({ windowManager, orchestrator, workspaceManager, terminalManager, sessionPids, teamCoordinator, debugLog });

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
    debugLog,
  });
  centralWorkerConnector.start();

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
  getCentralWorkerConnector: () => centralWorkerConnector,
  sessionPids,
  debugLog,
});
