import React, { type ReactElement, useEffect } from 'react';
import { RemoteViewRoot } from '../remote/root.js';
import { CloudflarePanel } from '../react/cloudflarePanel.js';
import { type DashboardView } from '../state/store.js';
import type {
  DashboardTerminalEntry,
  DashboardTerminalProfile,
} from '../shared.js';
import { fitActiveTerminal } from '../terminal/ui.js';
import { ArchiveView, HeatmapView } from './activityViews.js';
import { TerminalPanel } from './terminalPanel.js';

function viewClass(currentView: DashboardView, view: DashboardView): string {
  return `view-section${currentView === view ? ' active' : ''}`;
}

export function OtherViews({
  activeTerminalId,
  currentView,
  terminalDefaultProfileId,
  terminalProfileMenuOpen,
  terminalProfiles,
  terminals,
}: {
  activeTerminalId: string | null;
  currentView: DashboardView;
  terminalDefaultProfileId: string | null;
  terminalProfileMenuOpen: boolean;
  terminalProfiles: DashboardTerminalProfile[];
  terminals: Array<[string, DashboardTerminalEntry]>;
}): ReactElement {
  useEffect(() => {
    if (currentView !== 'terminal') return;
    const raf = requestAnimationFrame(() => fitActiveTerminal());
    return () => cancelAnimationFrame(raf);
  }, [currentView]);

  return (
    <>
      <HeatmapView currentView={currentView} />

      <div id="terminalView" className={viewClass(currentView, 'terminal')}>
        <TerminalPanel
          activeTerminalId={activeTerminalId}
          terminalDefaultProfileId={terminalDefaultProfileId}
          terminalProfileMenuOpen={terminalProfileMenuOpen}
          terminalProfiles={terminalProfiles}
          terminals={terminals}
        />
      </div>

      <div id="remoteView" className={viewClass(currentView, 'remote')}>
        <RemoteViewRoot active={currentView === 'remote'} />
      </div>

      <div id="cloudflareView" className={viewClass(currentView, 'cloudflare')}>
        <CloudflarePanel active={currentView === 'cloudflare'} />
      </div>

      <ArchiveView currentView={currentView} />
    </>
  );
}
