// @ts-nocheck
const { ipcMain } = require('electron');
const { dashboardIpcChannels } = require('../../shared/contracts/ipc');

function registerOrchestratorHandlers({ orchestrator }) {
  if (!orchestrator) {
    return;
  }

  ipcMain.handle(dashboardIpcChannels.orchestratorSubmitTask, async (_event, input) => {
    try {
      return { success: true, task: orchestrator.submitTask(input) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorCancelTask, async (_event, taskId) => {
    try {
      return { success: true, task: orchestrator.cancelTask(taskId) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorRetryTask, async (_event, taskId) => {
    try {
      return { success: true, task: orchestrator.retryTask(taskId) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorPauseTask, async (_event, taskId) => {
    try {
      return { success: true, task: orchestrator.pauseTask(taskId) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorResumeTask, async (_event, taskId) => {
    try {
      return { success: true, task: orchestrator.resumeTask(taskId) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorGetTask, async (_event, taskId) => {
    return orchestrator.getTask(taskId);
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorListTasks, async (_event, filters) => {
    if (filters && filters.status) {
      return orchestrator.getTasksByStatus(filters.status);
    }
    return orchestrator.getAllTasks();
  });

  ipcMain.handle(dashboardIpcChannels.orchestratorDeleteTask, async (_event, taskId) => {
    try {
      orchestrator.deleteTask(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerOrchestratorHandlers,
};
