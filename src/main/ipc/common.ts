function createWindowSenderHelpers({ windowManager }) {
  function getDashboardSenderWindow(event) {
    const senderId = event?.sender?.id;
    const mainWindow = windowManager?.mainWindow;
    const dashboardWindow = windowManager?.dashboardWindow;

    if (!senderId) return null;
    if (dashboardWindow && !dashboardWindow.isDestroyed?.() && dashboardWindow.webContents?.id === senderId) {
      return dashboardWindow;
    }
    if (mainWindow && !mainWindow.isDestroyed?.() && mainWindow.webContents?.id === senderId) {
      return mainWindow;
    }
    return null;
  }

  function isMainWindowSender(event) {
    const mainWindow = windowManager?.mainWindow;
    const senderWindow = getDashboardSenderWindow(event);
    if (!senderWindow || !mainWindow || mainWindow.isDestroyed?.()) return false;
    return senderWindow.webContents?.id === mainWindow.webContents?.id;
  }

  return {
    getDashboardSenderWindow,
    isMainWindowSender,
  };
}

module.exports = {
  createWindowSenderHelpers,
};
