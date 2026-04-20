import React, { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardApp } from './dashboardApp.js';

let root: Root | null = null;

export function mountDashboardApp(): void {
  const container = document.getElementById('dashboardRoot');
  if (!container) return;

  if (!root) {
    root = createRoot(container);
  }

  flushSync(() => {
    root?.render(createElement(DashboardApp));
  });
}
