
export function registerAppLifecycle({
  app,
  BrowserWindow,
  getAgentManager,
  getAgentListeners,
  getLivenessIntervals,
  getSessionScanner,
  getHeatmapScanner,
  getWindowManager,
  getHookServer,
  getCodexEventServer,
  getCodexSessionMonitor,
  getOrchestrator,
  getTerminalManager,
  getHookProcessor,
  getCodexProcessor,
  getCentralWorkerConnector,
  sessionPids,
  debugLog,
}) {
  app.on('activate', () => {
    const windowManager = getWindowManager();
    if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
      windowManager.createDashboardWindow();
    }
  });

  app.on('window-all-closed', () => {
    const agentManager = getAgentManager();
    if (agentManager) agentManager.stop();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    const agentManager = getAgentManager();
    const agentListeners = getAgentListeners();

    if (agentManager && agentListeners) {
      agentManager.removeListener('agent-added', agentListeners.onAdded);
      agentManager.removeListener('agent-updated', agentListeners.onUpdated);
      agentManager.removeListener('agent-removed', agentListeners.onRemoved);
      agentManager.removeListener('agents-cleaned', agentListeners.onCleaned);
    }

    if (agentManager) {
      agentManager.stop();
    }

    const livenessIntervals = getLivenessIntervals();
    if (livenessIntervals) {
      clearInterval(livenessIntervals.zombieSweepId);
      clearInterval(livenessIntervals.livenessCheckId);
      debugLog('[Main] Liveness intervals cleared');
    }

    const sessionScanner = getSessionScanner();
    if (sessionScanner) {
      sessionScanner.stop();
      debugLog('[Main] SessionScanner stopped');
    }

    const heatmapScanner = getHeatmapScanner();
    if (heatmapScanner) {
      heatmapScanner.stop();
      debugLog('[Main] HeatmapScanner stopped');
    }

    const windowManager = getWindowManager();
    if (windowManager) {
      windowManager.closeDashboardWindow();
      windowManager.stopDashboardServer();
      windowManager.stopKeepAlive();
    }

    const hookServer = getHookServer();
    if (hookServer) {
      hookServer.close();
    }

    const codexEventServer = getCodexEventServer();
    if (codexEventServer) {
      codexEventServer.close();
    }

    const codexSessionMonitor = getCodexSessionMonitor();
    if (codexSessionMonitor) {
      codexSessionMonitor.stop();
    }

    const orchestrator = getOrchestrator();
    if (orchestrator) {
      orchestrator.stop();
      debugLog('[Main] Orchestrator stopped');
    }

    const terminalManager = getTerminalManager();
    if (terminalManager) {
      terminalManager.destroyAll();
      debugLog('[Main] TerminalManager cleaned up');
    }

    const hookProcessor = getHookProcessor();
    if (hookProcessor) hookProcessor.cleanup();

    const codexProcessor = getCodexProcessor();
    if (codexProcessor) codexProcessor.cleanup();

    const centralWorkerConnector = getCentralWorkerConnector?.();
    if (centralWorkerConnector) {
      centralWorkerConnector.stop();
      debugLog('[Main] CentralWorkerConnector stopped');
    }

    sessionPids.clear();
    debugLog('[Main] All resources cleaned up');
  });
}
