import React, { type ReactElement, useEffect } from 'react';
import { renderArchiveView, renderHeatmapView } from '../activityViews.js';
import { setDashboardView, useDashboardSnapshot } from '../state/store.js';
import { DashboardModals } from '../react/modals.js';
import { setRegisteredOnlyFilter } from '../agentViews.js';
import { PowerShellPolicyBanner } from '../terminal/chrome.js';
import { dismissPsPolicyBanner, openPsPolicyTerminal } from '../terminal/index.js';
import { OfficeView } from './officeView.js';
import { OtherViews } from './otherViews.js';
import { Sidebar } from './sidebar.js';

function syncActiveView(currentView: ReturnType<typeof useDashboardSnapshot>['currentView']): void {
  if (currentView === 'heatmap') {
    void renderHeatmapView();
  } else if (currentView === 'archive') {
    void renderArchiveView();
  }

  if (currentView === 'remote') {
    import('../remote/polling.js').then((module) => {
      void module.renderRemoteView();
      module.startRemoteViewPolling();
    });
  } else {
    import('../remote/polling.js').then((module) => module.stopRemoteViewPolling());
  }

  if (currentView === 'cloudflare') {
    import('../cloudflareView.js').then((module) => {
      void module.renderCloudflareView();
      module.startCloudflareViewPolling();
    });
  } else {
    import('../cloudflareView.js').then((module) => module.stopCloudflareViewPolling());
  }
}

export function DashboardApp(): ReactElement {
  const snapshot = useDashboardSnapshot();

  useEffect(() => {
    syncActiveView(snapshot.currentView);
  }, [snapshot.currentView]);

  return (
    <>
      <div className="app-layout">
        <Sidebar
          connected={snapshot.connected}
          currentView={snapshot.currentView}
          onSelectView={setDashboardView}
        />
        <main className="main-area">
          <div className="disconnect-banner" hidden={snapshot.connected} id="disconnectBanner">
            Network disconnected. Attempting to restore websocket connection...
          </div>

          <PowerShellPolicyBanner
            visible={snapshot.psPolicyBlocked}
            onDismiss={dismissPsPolicyBanner}
            onFix={openPsPolicyTerminal}
          />

          <div className="scroll-container">
            <OfficeView
              activeTerminalId={snapshot.activeTerminalId}
              agentHistory={snapshot.agentHistory}
              currentFloorName={snapshot.currentFloorName}
              currentView={snapshot.currentView}
              focusedAgentId={snapshot.focusedAgentId}
              registeredOnly={snapshot.registeredOnly}
              stats={snapshot.stats}
              terminalDefaultProfileId={snapshot.terminalDefaultProfileId}
              terminalProfileMenuOpen={snapshot.terminalProfileMenuOpen}
              terminalProfiles={snapshot.terminalProfiles}
              terminals={snapshot.terminals}
              visibleAgents={snapshot.visibleAgents}
              onSetRegisteredOnly={setRegisteredOnlyFilter}
            />
            <OtherViews currentView={snapshot.currentView} />
          </div>
        </main>
      </div>

      <div className="mc-tooltip" id="mcTooltip" />
      <DashboardModals />
    </>
  );
}
