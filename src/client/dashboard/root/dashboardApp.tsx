import React, { type ReactElement, useEffect } from 'react';
import { renderArchiveView, renderHeatmapView } from '../activityViews.js';
import { setDashboardView, useDashboardSnapshot } from '../state/store.js';
import { DashboardModals } from '../react/modals.js';
import { setRegisteredOnlyFilter } from '../agentViews.js';
import { PowerShellPolicyBanner } from '../terminal/chrome.js';
import { dismissPsPolicyBanner, openPsPolicyTerminal } from '../terminal/index.js';
import { I18nProvider, useI18n } from '../../i18n/react.js';
import { OfficeView } from './officeView.js';
import { OtherViews } from './otherViews.js';
import { Sidebar } from './sidebar.js';

function syncActiveView(currentView: ReturnType<typeof useDashboardSnapshot>['currentView']): void {
  if (currentView === 'heatmap') {
    void renderHeatmapView();
  } else if (currentView === 'archive') {
    void renderArchiveView();
  }
}

export function DashboardApp(): ReactElement {
  return (
    <I18nProvider>
      <DashboardAppContent />
    </I18nProvider>
  );
}

function DashboardAppContent(): ReactElement {
  const snapshot = useDashboardSnapshot();
  const { t } = useI18n();

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
            {t('dashboard.connection.restoreWebsocket')}
          </div>

          <PowerShellPolicyBanner
            visible={snapshot.psPolicyBlocked}
            onDismiss={dismissPsPolicyBanner}
            onFix={openPsPolicyTerminal}
          />

          <div className="scroll-container">
            <OfficeView
              agentHistory={snapshot.agentHistory}
              currentFloorName={snapshot.currentFloorName}
              currentView={snapshot.currentView}
              focusedAgentId={snapshot.focusedAgentId}
              registeredOnly={snapshot.registeredOnly}
              stats={snapshot.stats}
              visibleAgents={snapshot.visibleAgents}
              onSetRegisteredOnly={setRegisteredOnlyFilter}
            />
            <OtherViews
              activeTerminalId={snapshot.activeTerminalId}
              currentView={snapshot.currentView}
              terminalDefaultProfileId={snapshot.terminalDefaultProfileId}
              terminalProfileMenuOpen={snapshot.terminalProfileMenuOpen}
              terminalProfiles={snapshot.terminalProfiles}
              terminals={snapshot.terminals}
            />
          </div>
        </main>
      </div>

      <DashboardModals />
    </>
  );
}
