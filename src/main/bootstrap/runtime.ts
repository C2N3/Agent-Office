// @ts-nocheck

const fs = require('fs');
const path = require('path');

function installStartupLogging({ app, processRef = process, consoleRef = console }) {
  const logDir = app.isPackaged ? app.getPath('userData') : __dirname;
  const errorLogPath = path.join(logDir, 'startup-error.log');
  const originalConsoleError = consoleRef.error;

  consoleRef.error = (...args) => {
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' ');
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    try {
      fs.appendFileSync(errorLogPath, logMessage);
    } catch (error) {
      processRef.stderr.write(`[log-write-error] ${error.message}\n`);
    }

    originalConsoleError.apply(consoleRef, args);
  };

  processRef.on('uncaughtException', (error) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`;
    try {
      fs.appendFileSync(errorLogPath, logMessage);
    } catch (logError) {
      processRef.stderr.write(`[log-write-error] ${logError.message}\n`);
    }
  });

  processRef.on('unhandledRejection', (reason) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] UNHANDLED REJECTION: ${reason}\n`;
    try {
      fs.appendFileSync(errorLogPath, logMessage);
    } catch (logError) {
      processRef.stderr.write(`[log-write-error] ${logError.message}\n`);
    }
  });

  const debugLog = (msg) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(path.join(logDir, 'debug.log'), logMsg);
    consoleRef.log(msg);
  };

  return { debugLog, errorLogPath, logDir };
}

function configureRuntime({ app, processRef = process }) {
  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-logging');
  app.commandLine.appendSwitch('log-level', '3');
  processRef.env.ELECTRON_DISABLE_LOGGING = '1';
}

function configureApplicationMenu({ Menu, isDev }) {
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
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

module.exports = {
  configureApplicationMenu,
  configureRuntime,
  installStartupLogging,
};
