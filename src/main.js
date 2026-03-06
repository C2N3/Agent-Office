/**
 * Pixel Agent Desk — Main Process Orchestrator
 * 모듈 초기화, 이벤트 연결, 앱 생명주기 관리
 */

const { app, BrowserWindow, ipcMain } = require('electron');
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
const { sessionPids, startLivenessChecker, detectClaudePidByTranscript } = require('./main/livenessChecker');
const { savePersistedState, recoverExistingSessions } = require('./main/sessionPersistence');
const { createWindowManager } = require('./main/windowManager');
const { registerIpcHandlers } = require('./main/ipcHandlers');

// =====================================================
// 에러 로그 파일로 저장
// =====================================================
const errorLogPath = path.join(__dirname, 'startup-error.log');
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { }

  originalConsoleError.apply(console, args);
};

// 전역 에러 핸들러
process.on('uncaughtException', (error) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`;
  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { }
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] UNHANDLED REJECTION: ${reason}\n`;
  try {
    fs.appendFileSync(errorLogPath, logMessage);
  } catch (e) { }
});

// Debug logging to file
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, 'debug.log'), logMsg);
  console.log(msg);
};

// =====================================================
// 앱 설정
// =====================================================
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
process.env.ELECTRON_DISABLE_LOGGING = '1';

// =====================================================
// 앱 인스턴스
// =====================================================
let agentManager = null;
let sessionScanner = null;
let heatmapScanner = null;
let windowManager = null;
let hookProcessor = null;

app.whenReady().then(() => {
  debugLog('========== Pixel Agent Desk started ==========');

  // 0. Claude CLI 훅 자동 등록
  registerClaudeHooks(debugLog);

  // 1. 에이전트 매니저 즉시 시작
  agentManager = new AgentManager();
  agentManager.start();

  // 2. 세션 스캐너 시작
  sessionScanner = new SessionScanner(agentManager, debugLog);
  sessionScanner.start(60_000);

  // 2.5. 히트맵 스캐너 시작
  heatmapScanner = new HeatmapScanner(debugLog);
  heatmapScanner.start(300_000);

  // 3. 훅 프로세서 생성
  hookProcessor = createHookProcessor({
    agentManager,
    sessionPids,
    debugLog,
    detectClaudePidByTranscript,
  });

  // 4. 윈도우 매니저 생성
  windowManager = createWindowManager({
    agentManager,
    sessionScanner,
    heatmapScanner,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
    getWindowSizeForAgents,
  });

  // 5. IPC 핸들러 등록
  registerIpcHandlers({
    agentManager,
    sessionPids,
    windowManager,
    debugLog,
    adaptAgentToDashboard,
    errorHandler,
  });

  // 6. 백그라운드 서비스 시작
  startHookServer({
    processHookEvent: hookProcessor.processHookEvent,
    debugLog,
    HOOK_SERVER_PORT,
    errorHandler,
  });
  windowManager.startDashboardServer();
  startLivenessChecker({ agentManager, debugLog });

  // 7. 기존 활성 세션 복구
  recoverExistingSessions({
    agentManager,
    sessionPids,
    firstPreToolUseDone: hookProcessor.firstPreToolUseDone,
    debugLog,
    errorHandler,
  });

  // 8. 테스트용 에이전트 (Main, Sub, Team 골고루)
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

  // 9. UI 생성
  windowManager.createWindow();

  // Renderer가 준비되면 현재 상태 전송
  ipcMain.once('renderer-ready', () => {
    debugLog('[Main] renderer-ready event received!');

    agentManager.on('agent-added', (agent) => {
      const mw = windowManager.mainWindow;
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('agent-added', agent);
      }
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) {
        const adaptedAgent = adaptAgentToDashboard(agent);
        dw.webContents.send('dashboard-agent-added', adaptedAgent);
      }
      savePersistedState({ agentManager, sessionPids });
    });

    agentManager.on('agent-updated', (agent) => {
      const mw = windowManager.mainWindow;
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('agent-updated', agent);
      }
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) {
        const adaptedAgent = adaptAgentToDashboard(agent);
        dw.webContents.send('dashboard-agent-updated', adaptedAgent);
      }
      savePersistedState({ agentManager, sessionPids });
    });

    agentManager.on('agent-removed', (data) => {
      const mw = windowManager.mainWindow;
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('agent-removed', data);
      }
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) {
        dw.webContents.send('dashboard-agent-removed', data);
      }
      savePersistedState({ agentManager, sessionPids });
      // 모든 에이전트가 사라지면 대시보드도 닫기
      if (agentManager.getAllAgents().length === 0) {
        windowManager.closeDashboardWindow();
      }
    });

    agentManager.on('agents-cleaned', (data) => {
      const mw = windowManager.mainWindow;
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('agents-cleaned', data);
      }
      const dw = windowManager.dashboardWindow;
      if (dw && !dw.isDestroyed()) {
        dw.webContents.send('dashboard-agent-removed', { type: 'batch', ...data });
      }
      savePersistedState({ agentManager, sessionPids });
      // 모든 에이전트가 사라지면 대시보드도 닫기
      if (agentManager.getAllAgents().length === 0) {
        windowManager.closeDashboardWindow();
      }
    });

    // 준비 전에 도착했던 세션 및 복구된 데이터 전송
    const allAgents = agentManager.getAllAgents();
    if (allAgents.length > 0) {
      debugLog(`[Main] Sending ${allAgents.length} agents to newly ready renderer`);
      const mw = windowManager.mainWindow;
      allAgents.forEach(agent => {
        mw.webContents.send('agent-added', agent);
      });
      windowManager.resizeWindowForAgents(allAgents);
    }

    hookProcessor.flushPendingStarts();
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
  if (agentManager) agentManager.stop();
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

  // 모든 리소스 정리
  if (hookProcessor) hookProcessor.cleanup();
  sessionPids.clear();

  debugLog('[Main] All resources cleaned up');
});
