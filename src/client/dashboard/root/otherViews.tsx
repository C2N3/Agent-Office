import React, { type ReactElement } from 'react';
import { RemoteViewRoot } from '../remote/root.js';
import { type DashboardView } from '../state/store.js';
import { ArchiveView, HeatmapView } from './activityViews.js';

function viewClass(currentView: DashboardView, view: DashboardView): string {
  return `view-section${currentView === view ? ' active' : ''}`;
}

export function OtherViews({ currentView }: { currentView: DashboardView }): ReactElement {
  return (
    <>
      <HeatmapView currentView={currentView} />

      <div id="remoteView" className={viewClass(currentView, 'remote')}>
        <RemoteViewRoot />
      </div>

      <div id="cloudflareView" className={viewClass(currentView, 'cloudflare')}>
        <div className="panel remote-panel">
          <div className="standby-state">Loading…</div>
        </div>
      </div>

      <ArchiveView currentView={currentView} />
    </>
  );
}
