import {
  type DisplayValue,
  state,
} from '../shared.js';
import {
  connectSSE,
  removeAgent,
  renderAgentList,
  updateAgent,
} from '../agentViews.js';
import { setupOfficeInteractionRuntime } from '../office.js';
import {
  fitActiveTerminal,
  initResizableHandles,
  initTerminalProfileMenu,
  initTerminals,
  openTerminalForAgent,
  refreshTerminalProfiles,
} from '../terminal/index.js';
import {
  officeOnAgentCreated,
  officeOnAgentRemoved,
  officeOnAgentUpdated,
  setupOfficeRuntime,
} from '../../office/index.js';
import { installHoverTooltips } from '../../../shared/uiTooltip.js';
import { startCentralAgentSync } from '../centralAgents/index.js';
import { initOverlayControls, initPipControls } from '../app/windowControls.js';
import { installDashboardRuntimeGlobals } from './globals.js';

type DashboardUiError = Error | { message?: string } | DisplayValue;

function initEventStreams() {
  connectSSE();
  startCentralAgentSync({
    upsertAgent: (agent) => {
      const existing = state.agents.has(agent.id);
      updateAgent(agent);
      if (existing) {
        officeOnAgentUpdated(agent);
      } else {
        officeOnAgentCreated(agent);
      }
    },
    removeAgent: (id) => {
      removeAgent(id);
      officeOnAgentRemoved({ id });
    },
  });
}

function initTerminalRuntime() {
  initTerminals();
  initTerminalProfileMenu();
  refreshTerminalProfiles().catch((error: DashboardUiError) => console.error('[Terminal Profiles]', error));
  initResizableHandles?.();
}

function initOfficeRuntime() {
  setTimeout(() => {
    setupOfficeRuntime()
      .then(() => renderAgentList())
      .catch((error: DashboardUiError) => console.error('[Office Init]', error));
    setupOfficeInteractionRuntime({ openTerminalForAgent });
  }, 100);
}

export function initDashboardRuntime() {
  installDashboardRuntimeGlobals(openTerminalForAgent);

  initPipControls();
  initOverlayControls();

  initEventStreams();
  initTerminalRuntime();
  initOfficeRuntime();

  installHoverTooltips({
    selector: '.mc-agent-card [data-tooltip], .mc-agent-card button[title]',
  });

  window.addEventListener('resize', () => {
    fitActiveTerminal();
  });
}
