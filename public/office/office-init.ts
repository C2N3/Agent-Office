// @ts-nocheck
/**
 * Office Init — Entry point: agent sync, render loop start
 * SSE events are received from dashboard's connectSSE() — no separate connection needed.
 */

/* eslint-disable no-unused-vars */

import { loadAvatarFiles, loadOfficeLayout, loadSpriteFrames } from './office-config.js';
import { officeCharacters } from './office-character.js';
import { officeRenderer } from './office-renderer.js';

let officeInitialized = false;

function isRegisteredOnlyOfficeFilterEnabled() {
  const officeWindow = window as Window & {
    dashboardIsRegisteredOnlyFilterEnabled?: () => boolean;
  };
  if (typeof officeWindow.dashboardIsRegisteredOnlyFilterEnabled === 'function') {
    return !!officeWindow.dashboardIsRegisteredOnlyFilterEnabled();
  }
  try {
    return localStorage.getItem('mc-filter-registered-only') !== 'false';
  } catch (e) {
    return true;
  }
}

function shouldDisplayOfficeAgent(agent) {
  return !isRegisteredOnlyOfficeFilterEnabled() || !!(agent && agent.isRegistered);
}

export async function initOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
    return;
  }

  // Load shared config before anything else
  await Promise.all([loadAvatarFiles(), loadSpriteFrames(), loadOfficeLayout()]);

  const canvas = document.getElementById('office-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  // Show loading indicator
  const container = canvas.parentElement as HTMLElement;
  let loadingEl = container.querySelector('.office-loading') as HTMLElement | null;
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'office-loading';
    loadingEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);color:#fff;font-size:14px;z-index:10;';
    loadingEl.textContent = 'Loading Office...';
    container.style.position = 'relative';
    container.appendChild(loadingEl);
  }

  try {
    await officeRenderer.init(canvas);
  } catch (e) {
    console.error('[Office] Init failed:', e);
    if (loadingEl) loadingEl.textContent = 'Failed to load office view';
    return;
  }

  // Load existing agents
  try {
    const res = await fetch('/api/agents');
    const agents = await res.json();
    agents.forEach(function (a: any) {
      if (!shouldDisplayOfficeAgent(a)) return;
      officeCharacters.addCharacter(a);
    });
  } catch (e) {
    console.error('[Office] Failed to fetch agents:', e);
  }

  // Remove loading indicator
  if (loadingEl) loadingEl.remove();

  officeInitialized = true;
}

/** Called from dashboard SSE agent.created handler */
export function officeOnAgentCreated(data: any) {
  if (!officeInitialized) return;
  if (!shouldDisplayOfficeAgent(data)) return;
  officeCharacters.addCharacter(data);
}

/** Called from dashboard SSE agent.updated handler */
export function officeOnAgentUpdated(data: any) {
  if (!officeInitialized) return;
  if (!shouldDisplayOfficeAgent(data)) {
    officeCharacters.removeCharacter(data.id);
    return;
  }
  officeCharacters.updateCharacter(data);
}

/** Called from dashboard SSE agent.removed handler */
export function officeOnAgentRemoved(data: any) {
  if (officeInitialized) officeCharacters.removeCharacter(data.id);
}

export function stopOffice() {
  officeRenderer.stop();
}

export function resumeOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
  }
}
