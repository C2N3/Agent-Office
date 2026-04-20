import React, { type ReactElement } from 'react';
import { type DashboardView } from '../state/store.js';

export function OfficeView({
  currentView,
  registeredOnly,
}: {
  currentView: DashboardView;
  registeredOnly: boolean;
}): ReactElement {
  return (
    <div id="officeView" className={`view-section${currentView === 'office' ? ' active' : ''}`}>
      <div className="kpi-grid">
        <div className="panel kpi-card">
          <div className="kpi-title">Active Agents</div>
          <div className="kpi-value blue" id="kpiActiveAgents">
            0{' '}
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dark)' }}>
              / <span id="kpiTotalAgents">0</span>
            </span>
          </div>
        </div>
        <div className="kpi-card panel">
          <div className="kpi-title">Errors (24h)</div>
          <div className="kpi-value green" id="kpiErrors">0</div>
        </div>
      </div>

      <div className="office-terminal-layout" id="mainLayout">
        <div className="office-left-col" id="leftCol">
          <div className="panel office-canvas-panel" id="officePanel">
            <div className="panel-header">
              <div className="panel-header-title">
                <span>Office</span>
                <span className="panel-header-badge">LIVE</span>
                <span className="panel-header-badge panel-header-filter-badge" id="officeFilterBadge">Registered Only</span>
              </div>
              <div className="panel-header-actions">
                <label className="panel-filter-toggle" htmlFor="officeRegisteredFilterToggle" title="Show only registered agents">
                  <input type="checkbox" id="officeRegisteredFilterToggle" defaultChecked={registeredOnly} />
                  <span>Registered Only</span>
                </label>
                <button className="pip-toggle-btn" id="overlayToggleBtn" title="Overlay (Always on top)" type="button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="1" width="12" height="9" rx="1.5" strokeDasharray="2 1.5" />
                    <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M5 13h6" />
                  </svg>
                </button>
                <button className="pip-toggle-btn" id="pipToggleBtn" title="Picture-in-Picture" type="button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="2" width="14" height="11" rx="1.5" />
                    <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="floor-tabs" id="floorTabs">
              <div className="floor-tabs-list" id="floorTabsList" />
              <button className="floor-tab-add" id="floorAddBtn" title="Add Floor" type="button">+</button>
              <button className="floor-tab-manage" id="floorManageBtn" title="Manage Floors" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            <div className="panel-body">
              <canvas id="office-canvas" />
              <div className="pip-placeholder" id="pipPlaceholder">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#8b949e" strokeWidth="2">
                  <rect x="4" y="8" width="40" height="32" rx="4" />
                  <rect x="24" y="22" width="18" height="14" rx="2" fill="#2d333b" stroke="#8b949e" />
                </svg>
                <div className="pip-placeholder-text">Playing in PiP mode</div>
                <button className="pip-placeholder-btn" id="pipStopBtn" type="button">Close PiP and view here</button>
              </div>
            </div>
          </div>

          <div className="resize-handle-h" id="resizeH" />

          <div className="panel agent-list-panel" id="agentListPanel">
            <div className="panel-header">
              <div className="panel-header-title">
                <span>Agent List</span>
                <span className="panel-header-badge panel-header-filter-badge" id="agentListFilterBadge">Registered Only</span>
              </div>
              <div className="panel-header-actions">
                <label className="panel-filter-toggle" htmlFor="agentListRegisteredFilterToggle" title="Show only registered agents">
                  <input type="checkbox" id="agentListRegisteredFilterToggle" defaultChecked={registeredOnly} />
                  <span>Registered Only</span>
                </label>
                <button className="bulk-archive-btn" id="bulkArchiveBtn" title="Clear inactive unregistered agents" type="button">
                  Clear Unregistered
                </button>
                <button className="agent-create-btn" id="createAgentBtn" title="Register New Agent" type="button">
                  + New
                </button>
              </div>
            </div>
            <div className="panel-body" id="agentPanel">
              <div className="standby-state" id="standbyMessage">
                <div>No agents dispatched.</div>
                <div style={{ fontSize: '0.7rem', marginTop: '6px' }}>Spawn an agent via CLI to populate roster.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="resize-handle-v" id="resizeV" />

        <div className="office-right-col panel" id="terminalPanel">
          <div className="terminal-tabs" id="terminalTabs">
            <div className="terminal-tabs-list" id="terminalTabsList" />
            <div className="terminal-toolbar">
              <button className="terminal-collapse-btn" id="terminalCollapseBtn" type="button" aria-controls="terminalPanel" aria-expanded="true" title="Collapse Terminal">
                &gt;
              </button>
              <button className="terminal-new-btn" id="terminalNewBtn" title="New Terminal" type="button">+</button>
            </div>
          </div>
          <div className="terminal-container" id="terminalContainer">
            <div className="terminal-empty-state" id="terminalEmptyState">
              <svg width="48" height="48" fill="none" stroke="#8b949e" strokeWidth="1.5">
                <polyline points="8 34 20 22 8 10" />
                <line x1="24" y1="38" x2="40" y2="38" />
              </svg>
              <div style={{ marginTop: '12px' }}>No terminal open</div>
              <div style={{ fontSize: '0.7rem', marginTop: '6px', color: 'var(--color-text-dark)' }}>Click an agent to open a terminal.</div>
            </div>
            <div className="terminal-launch-popover" id="terminalProfileMenu" />
          </div>
        </div>
      </div>

      <div className="office-popover" id="officePopover" />
    </div>
  );
}
