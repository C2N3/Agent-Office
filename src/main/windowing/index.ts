/**
 * Window Manager
 * Main window, dashboard window, keep-alive, resize, dashboard server management
 */

const { createWindowManagerCore } = require('./core');

function createWindowManager(options) {
  return createWindowManagerCore(options);
}

module.exports = { createWindowManager };
