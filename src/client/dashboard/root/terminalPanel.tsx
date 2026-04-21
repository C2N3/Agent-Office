import React, { type ReactElement } from 'react';
import type {
  DashboardTerminalEntry,
  DashboardTerminalProfile,
} from '../shared.js';
import { TerminalProfileMenu, TerminalTabs } from '../terminal/chrome.js';
import { openTerminalForAgent } from '../terminal/index.js';
import {
  closeTerminalProfileMenu,
  openTerminalProfileMenu,
  refreshTerminalProfiles,
  setDefaultTerminalProfile,
} from '../terminal/profiles.js';
import {
  activateTerminalTab,
  closeTerminal,
  fitActiveTerminal,
} from '../terminal/ui.js';
import { toggleTerminalPanelCollapsed } from '../terminal/collapse.js';

export function TerminalPanel({
  activeTerminalId,
  collapsed,
  terminalEmptyHintClassName,
  terminalEmptyTitleClassName,
  terminalDefaultProfileId,
  terminalProfileMenuOpen,
  terminalProfiles,
  terminals,
}: {
  activeTerminalId: string | null;
  collapsed: boolean;
  terminalEmptyHintClassName?: string;
  terminalEmptyTitleClassName?: string;
  terminalDefaultProfileId: string | null;
  terminalProfileMenuOpen: boolean;
  terminalProfiles: DashboardTerminalProfile[];
  terminals: Array<[string, DashboardTerminalEntry]>;
}): ReactElement {
  const defaultTerminalProfile = terminalProfiles.find((profile) => profile.id === terminalDefaultProfileId) || terminalProfiles[0] || null;
  const collapseLabel = collapsed ? 'Expand Terminal' : 'Collapse Terminal';

  const handleTerminalNewClick = async () => {
    if (terminalProfileMenuOpen) {
      closeTerminalProfileMenu();
      return;
    }

    try {
      await refreshTerminalProfiles();
      openTerminalProfileMenu();
    } catch (error) {
      console.error('[Terminal Profiles]', error);
    }
  };

  const handleOpenProfile = async (profileId: string) => {
    const profile = terminalProfiles.find((entry) => entry.id === profileId) || defaultTerminalProfile;
    await openTerminalForAgent(`local-${Date.now()}`, {
      profileId,
      label: profile?.title || 'Terminal',
    });
  };

  return (
    <div className="office-right-col panel" id="terminalPanel">
      <div className="terminal-tabs" id="terminalTabs">
        <div className="terminal-tabs-list" id="terminalTabsList">
          <TerminalTabs
            activeId={activeTerminalId}
            terminals={terminals}
            onActivate={activateTerminalTab}
            onClose={closeTerminal}
          />
        </div>
        <div className="terminal-toolbar">
          <button
            aria-controls="terminalPanel"
            aria-expanded={!collapsed}
            aria-label={collapseLabel}
            className="terminal-collapse-btn"
            id="terminalCollapseBtn"
            title={collapseLabel}
            type="button"
            onClick={() => toggleTerminalPanelCollapsed(fitActiveTerminal)}
          >
            {collapsed ? '<' : '>'}
          </button>
          <button
            className="terminal-new-btn"
            id="terminalNewBtn"
            title={defaultTerminalProfile ? `New Terminal (${defaultTerminalProfile.title})` : 'New Terminal'}
            type="button"
            onClick={() => {
              void handleTerminalNewClick();
            }}
          >
            +
          </button>
        </div>
      </div>
      <div className="terminal-container" id="terminalContainer">
        <div className="terminal-empty-state" hidden={terminals.length > 0} id="terminalEmptyState">
          <svg width="48" height="48" fill="none" stroke="#8b949e" strokeWidth="1.5">
            <polyline points="8 34 20 22 8 10" />
            <line x1="24" y1="38" x2="40" y2="38" />
          </svg>
          <div className={terminalEmptyTitleClassName}>No terminal open</div>
          <div className={terminalEmptyHintClassName}>Click an agent to open a terminal.</div>
        </div>
        <TerminalProfileMenu
          defaultProfileId={terminalDefaultProfileId}
          open={terminalProfileMenuOpen}
          onClose={closeTerminalProfileMenu}
          onOpenProfile={handleOpenProfile}
          onSetDefaultProfile={(profileId) => {
            void setDefaultTerminalProfile(profileId);
          }}
          profiles={terminalProfiles}
        />
      </div>
    </div>
  );
}
