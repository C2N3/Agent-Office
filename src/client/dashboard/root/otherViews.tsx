import React, { type ReactElement } from 'react';
import { RemoteViewRoot } from '../remote/root.js';
import { type DashboardView } from '../state/store.js';

function viewClass(currentView: DashboardView, view: DashboardView): string {
  return `view-section${currentView === view ? ' active' : ''}`;
}

export function OtherViews({ currentView }: { currentView: DashboardView }): ReactElement {
  return (
    <>
      <div id="heatmapView" className={viewClass(currentView, 'heatmap')}>
        <div className="panel heatmap-panel">
          <div className="heatmap-header">
            <div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Activity Mesh</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Historical agent session frequency over the past year.
              </div>
            </div>
            <div className="heatmap-stats-row" id="hmStatsRoot" />
          </div>

          <div className="heatmap-container-scroll">
            <div className="heatmap-grid" id="heatmapGrid" />
          </div>

          <div
            style={{
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              display: 'flex',
              fontSize: '0.65rem',
              gap: '6px',
              justifyContent: 'flex-end',
              marginTop: '16px',
            }}
          >
            Less
            <div className="hm-cell" style={{ background: '#161b22' }} />
            <div className="hm-cell l1" />
            <div className="hm-cell l2" />
            <div className="hm-cell l3" />
            <div className="hm-cell l4" />
            More
          </div>
        </div>
      </div>

      <div id="remoteView" className={viewClass(currentView, 'remote')}>
        <RemoteViewRoot />
      </div>

      <div id="cloudflareView" className={viewClass(currentView, 'cloudflare')}>
        <div className="panel remote-panel">
          <div className="standby-state">Loading…</div>
        </div>
      </div>

      <div id="archiveView" className={viewClass(currentView, 'archive')}>
        <div className="panel archive-panel">
          <div className="archive-header">
            <div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Registry Archive</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Archived agent records with session history and lifecycle totals.
              </div>
            </div>
            <button className="btn-secondary archive-refresh-btn" id="archiveRefreshBtn" type="button">Refresh</button>
          </div>
          <div className="archive-grid" id="archiveGrid">
            <div className="standby-state">No archived agent records yet.</div>
          </div>
        </div>
      </div>
    </>
  );
}
