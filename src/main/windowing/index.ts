/**
 * Window Manager
 * Main window, dashboard window, keep-alive, resize, dashboard server management
 */

import { createWindowManagerCore } from './core';

export function createWindowManager(options) {
  return createWindowManagerCore(options);
}
