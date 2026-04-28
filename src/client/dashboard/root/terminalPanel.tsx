import React, { type ReactElement, useRef } from 'react';
import type {
  DashboardTerminalEntry,
  DashboardTerminalProfile,
} from '../shared';
import { TerminalProfileMenu, TerminalTabs } from '../terminal/chrome';
import { openTerminalForAgent } from '../terminal/index';
import {
  closeTerminalProfileMenu,
  openTerminalProfileMenu,
  refreshTerminalProfiles,
  setDefaultTerminalProfile,
} from '../terminal/profiles';
import {
  activateTerminalTab,
  closeTerminal,
  registerTerminalContainerHost,
  registerTerminalEmptyStateHost,
} from '../terminal/ui';

export function TerminalPanel({
  activeTerminalId,
  terminalDefaultProfileId,
  terminalProfileMenuOpen,
  terminalProfiles,
  terminals,
}: {
  activeTerminalId: string | null;
  terminalDefaultProfileId: string | null;
  terminalProfileMenuOpen: boolean;
  terminalProfiles: DashboardTerminalProfile[];
  terminals: Array<[string, DashboardTerminalEntry]>;
}): ReactElement {
  const newTerminalButtonRef = useRef<HTMLButtonElement | null>(null);
  const defaultTerminalProfile = terminalProfiles.find((profile) => profile.id === terminalDefaultProfileId) || terminalProfiles[0] || null;

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
    <div className="terminal-view-panel panel" id="terminalPanel">
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
            ref={newTerminalButtonRef}
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
      <div ref={registerTerminalContainerHost} className="terminal-container" id="terminalContainer">
        <div ref={registerTerminalEmptyStateHost} className="terminal-empty-state" hidden={terminals.length > 0} id="terminalEmptyState">
          <svg width="48" height="48" fill="none" stroke="#8b949e" strokeWidth="1.5">
            <polyline points="8 34 20 22 8 10" />
            <line x1="24" y1="38" x2="40" y2="38" />
          </svg>
          <div className="terminal-empty-title">No terminal open</div>
          <div className="terminal-empty-hint">Click an agent to open a terminal.</div>
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
          triggerRef={newTerminalButtonRef}
        />
      </div>
    </div>
  );
}
