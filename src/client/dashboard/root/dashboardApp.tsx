import React, { type ReactElement, useEffect } from 'react';
import { renderArchiveView, renderHeatmapView } from '../activityViews.js';
import { setDashboardView, useDashboardSnapshot } from '../state/store.js';
import { DashboardModals } from '../react/modals.js';
import { setRegisteredOnlyFilter } from '../agentViews.js';
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

          <div id="psPolicyBanner" className="ps-policy-banner">
            <span>PowerShell 외부 스크립트 실행이 차단되어 있습니다. Claude CLI를 사용하려면 스크립트 실행 허용이 필요합니다.</span>
            <button id="psPolicyFixBtn" type="button">설정 열기</button>
            <button id="psPolicyDismissBtn" type="button">닫기</button>
          </div>

          <div className="scroll-container">
            <OfficeView
              activeTerminalId={snapshot.activeTerminalId}
              agentHistory={snapshot.agentHistory}
              currentFloorName={snapshot.currentFloorName}
              currentView={snapshot.currentView}
              focusedAgentId={snapshot.focusedAgentId}
              registeredOnly={snapshot.registeredOnly}
              stats={snapshot.stats}
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
