import React, { type MouseEvent, type ReactElement, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  assignTaskToAgent,
  changeAgentAvatar,
  deleteAgentRecord,
  focusAgentCard,
  formTeamForAgent,
  mergeWorkspaceAgent,
  openAgentHistory,
  openCreateAgentModal,
  removeWorkspaceAgent,
  renameAgentNickname,
  terminateAgent,
  unregisterAgent,
} from '../agentActions.js';
import { clearUnregisteredAgents, getClearableUnregisteredAgents } from '../agentViews.js';
import { AgentPanel } from '../react/agentPanel.js';
import type {
  DashboardAgent,
  DashboardAgentHistoryEntry,
  DashboardTerminalEntry,
} from '../shared.js';
import {
  getTerminalPanelCollapsed,
  subscribeTerminalPanelCollapse,
} from '../terminal/collapse.js';
import { beginHorizontalPanelResize, beginVerticalPanelResize } from '../terminal/resizable.js';
import { fitActiveTerminal } from '../terminal/ui.js';
import { FloorTabsContainer } from './floorTabsContainer.js';
import { TerminalPanel } from './terminalPanel.js';
import { type DashboardView } from '../state/store.js';
import {
  toggleOverlayWindow,
  togglePipWindow,
  useWindowControlsSnapshot,
} from '../app/windowControls.js';
import { registerOfficePopoverHost, updateOfficeInteractionRuntime } from '../office.js';
import { registerOfficeCanvasHost } from '../../office/index.js';
import styles from './officeView.module.scss';

export function OfficeView({
  activeTerminalId,
  agentHistory,
  currentFloorName,
  currentView,
  focusedAgentId,
  registeredOnly,
  stats,
  terminalDefaultProfileId,
  terminalProfileMenuOpen,
  terminalProfiles,
  terminals,
  visibleAgents,
  onSetRegisteredOnly,
}: {
  activeTerminalId: string | null;
  agentHistory: Map<string, DashboardAgentHistoryEntry[]>;
  currentFloorName: string;
  currentView: DashboardView;
  focusedAgentId: string | null;
  registeredOnly: boolean;
  stats: {
    active: number;
    completed: number;
    errorCount: number;
    total: number;
  };
  terminalDefaultProfileId: string | null;
  terminalProfileMenuOpen: boolean;
  terminalProfiles: Array<{ id: string; title: string }>;
  terminals: Array<[string, DashboardTerminalEntry]>;
  visibleAgents: DashboardAgent[];
  onSetRegisteredOnly: (enabled: boolean) => void;
}): ReactElement {
  const registeredOnlyLabel = registeredOnly ? 'Registered Only' : 'All Agents';
  const hasErrors = stats.errorCount > 0;
  const terminalPanelCollapsed = useSyncExternalStore(
    subscribeTerminalPanelCollapse,
    getTerminalPanelCollapsed,
    getTerminalPanelCollapsed,
  );
  const windowControls = useWindowControlsSnapshot();
  const clearableUnregisteredCount = getClearableUnregisteredAgents().length;
  const clearableUnregisteredLabel = clearableUnregisteredCount > 0 ? `Clear Unregistered (${clearableUnregisteredCount})` : 'Clear Unregistered';
  const clearableUnregisteredTitle = clearableUnregisteredCount > 0 ? `Clear ${clearableUnregisteredCount} inactive unregistered agent${clearableUnregisteredCount === 1 ? '' : 's'}` : 'No inactive unregistered agents available to clear';
  const mainLayoutRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const officePanelRef = useRef<HTMLDivElement | null>(null);
  const agentListPanelRef = useRef<HTMLDivElement | null>(null);
  const resizeHorizontalRef = useRef<HTMLDivElement | null>(null);
  const resizeVerticalRef = useRef<HTMLDivElement | null>(null);
  const registerOfficeCanvas = useCallback((element: HTMLCanvasElement | null) => {
    registerOfficeCanvasHost(element);
    updateOfficeInteractionRuntime();
  }, []);
  const registerOfficePopover = useCallback((element: HTMLDivElement | null) => {
    registerOfficePopoverHost(element);
    updateOfficeInteractionRuntime();
  }, []);

  const startHorizontalResize = (event: MouseEvent<HTMLDivElement>) => {
    beginHorizontalPanelResize({
      agentListPanel: agentListPanelRef.current,
      event,
      handle: resizeHorizontalRef.current,
      leftCol: leftColRef.current,
      officePanel: officePanelRef.current,
    });
  };

  const startVerticalResize = (event: MouseEvent<HTMLDivElement>) => {
    beginVerticalPanelResize({
      event,
      fitActiveTerminal,
      handle: resizeVerticalRef.current,
      leftCol: leftColRef.current,
      mainLayout: mainLayoutRef.current,
    });
  };

  return (
    <div id="officeView" className={`view-section${currentView === 'office' ? ' active' : ''}`}>
      <div className="kpi-grid">
        <div className="panel kpi-card">
          <div className="kpi-title">Active Agents</div>
          <div className="kpi-value blue" id="kpiActiveAgents">
            {stats.active}{' '}
            <span className={styles.kpiSplit}>
              / <span id="kpiTotalAgents">{stats.total}</span>
            </span>
          </div>
        </div>
        <div className="kpi-card panel">
          <div className="kpi-title">Errors (24h)</div>
          <div className={`kpi-value ${hasErrors ? 'error' : 'green'}`} id="kpiErrors">{stats.errorCount}</div>
        </div>
      </div>

      <div ref={mainLayoutRef} className={`office-terminal-layout${terminalPanelCollapsed ? ' terminal-collapsed' : ''}`} id="mainLayout">
        <div ref={leftColRef} className="office-left-col" id="leftCol">
          <div ref={officePanelRef} className="panel office-canvas-panel" id="officePanel">
            <div className="panel-header">
              <div className="panel-header-title">
                <span>Office</span>
                <span className="panel-header-badge">LIVE</span>
                <span
                  className={`panel-header-badge panel-header-filter-badge${registeredOnly ? '' : ' is-off'}`}
                  id="officeFilterBadge"
                >
                  {registeredOnlyLabel}
                </span>
              </div>
              <div className="panel-header-actions">
                <label className="panel-filter-toggle" htmlFor="officeRegisteredFilterToggle" title="Show only registered agents">
                  <input
                    checked={registeredOnly}
                    id="officeRegisteredFilterToggle"
                    type="checkbox"
                    onChange={(event) => onSetRegisteredOnly(event.currentTarget.checked)}
                  />
                  <span>Registered Only</span>
                </label>
                <button
                  className={`pip-toggle-btn${windowControls.overlayOpen ? ' active' : ''}`}
                  id="overlayToggleBtn"
                  title="Overlay (Always on top)"
                  type="button"
                  onClick={toggleOverlayWindow}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="1" width="12" height="9" rx="1.5" strokeDasharray="2 1.5" />
                    <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M5 13h6" />
                  </svg>
                </button>
                <button
                  className={`pip-toggle-btn${windowControls.pipOpen ? ' active' : ''}`}
                  id="pipToggleBtn"
                  title="Picture-in-Picture"
                  type="button"
                  onClick={togglePipWindow}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="2" width="14" height="11" rx="1.5" />
                    <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="floor-tabs" id="floorTabs">
              <FloorTabsContainer />
            </div>

            <div className="panel-body">
              <canvas ref={registerOfficeCanvas} id="office-canvas" style={{ display: windowControls.pipOpen ? 'none' : 'block' }} />
              <div className="pip-placeholder" id="pipPlaceholder" style={{ display: windowControls.pipOpen ? 'flex' : 'none' }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#8b949e" strokeWidth="2">
                  <rect x="4" y="8" width="40" height="32" rx="4" />
                  <rect x="24" y="22" width="18" height="14" rx="2" fill="#2d333b" stroke="#8b949e" />
                </svg>
                <div className="pip-placeholder-text">Playing in PiP mode</div>
                <button className="pip-placeholder-btn" id="pipStopBtn" type="button" onClick={togglePipWindow}>Close PiP and view here</button>
              </div>
            </div>
          </div>

          <div ref={resizeHorizontalRef} className="resize-handle-h" id="resizeH" onMouseDown={startHorizontalResize} />

          <div ref={agentListPanelRef} className="panel agent-list-panel" id="agentListPanel">
            <div className="panel-header">
              <div className="panel-header-title">
                <span>{`Agent List - ${currentFloorName}`}</span>
                <span
                  className={`panel-header-badge panel-header-filter-badge${registeredOnly ? '' : ' is-off'}`}
                  id="agentListFilterBadge"
                >
                  {registeredOnlyLabel}
                </span>
              </div>
              <div className="panel-header-actions">
                <label className="panel-filter-toggle" htmlFor="agentListRegisteredFilterToggle" title="Show only registered agents">
                  <input
                    checked={registeredOnly}
                    id="agentListRegisteredFilterToggle"
                    type="checkbox"
                    onChange={(event) => onSetRegisteredOnly(event.currentTarget.checked)}
                  />
                  <span>Registered Only</span>
                </label>
                <button className="bulk-archive-btn" disabled={clearableUnregisteredCount === 0} id="bulkArchiveBtn" title={clearableUnregisteredTitle} type="button" onClick={() => { void clearUnregisteredAgents(); }}>
                  {clearableUnregisteredLabel}
                </button>
                <button className="agent-create-btn" id="createAgentBtn" title="Register New Agent" type="button" onClick={openCreateAgentModal}>
                  + New
                </button>
              </div>
            </div>
            <div className="panel-body" id="agentPanel">
              <AgentPanel
                agents={visibleAgents}
                focusedAgentId={focusedAgentId}
                historyByAgent={agentHistory}
                onAssignTask={assignTaskToAgent}
                onChangeAvatar={changeAgentAvatar}
                onDelete={deleteAgentRecord}
                onFocus={focusAgentCard}
                onFormTeam={formTeamForAgent}
                onMergeWorkspace={mergeWorkspaceAgent}
                onOpenHistory={openAgentHistory}
                onRemoveWorkspace={removeWorkspaceAgent}
                onRename={renameAgentNickname}
                onTerminate={terminateAgent}
                onUnregister={unregisterAgent}
              />
            </div>
          </div>
        </div>

        <div ref={resizeVerticalRef} className="resize-handle-v" id="resizeV" onMouseDown={startVerticalResize} />

        <TerminalPanel
          activeTerminalId={activeTerminalId}
          collapsed={terminalPanelCollapsed}
          terminalEmptyHintClassName={styles.terminalEmptyHint}
          terminalEmptyTitleClassName={styles.terminalEmptyTitle}
          terminalDefaultProfileId={terminalDefaultProfileId}
          terminalProfileMenuOpen={terminalProfileMenuOpen}
          terminalProfiles={terminalProfiles}
          terminals={terminals}
        />
      </div>

      <div ref={registerOfficePopover} className="office-popover" id="officePopover" />
    </div>
  );
}
