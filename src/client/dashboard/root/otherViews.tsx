import React, { type ReactElement } from 'react';
import { RemoteViewRoot } from '../remote/root.js';
import { CloudflarePanel } from '../react/cloudflarePanel.js';
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
        <RemoteViewRoot active={currentView === 'remote'} />
      </div>

      <div id="cloudflareView" className={viewClass(currentView, 'cloudflare')}>
        <CloudflarePanel active={currentView === 'cloudflare'} />
      </div>

      <ArchiveView currentView={currentView} />
    </>
  );
}
