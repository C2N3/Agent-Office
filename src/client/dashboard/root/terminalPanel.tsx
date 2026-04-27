import React, { type ReactElement, useRef } from 'react';
import { useI18n } from '../../i18n/react.js';
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
  registerTerminalContainerHost,
  registerTerminalEmptyStateHost,
} from '../terminal/ui.js';

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
  const { t } = useI18n();
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
      label: profile?.title || t('dashboard.sidebar.terminal'),
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
            title={defaultTerminalProfile ? t('terminal.newWithProfile', { profile: defaultTerminalProfile.title }) : t('terminal.new')}
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
          <div className="terminal-empty-title">{t('terminal.emptyTitle')}</div>
          <div className="terminal-empty-hint">{t('terminal.emptyHint')}</div>
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
