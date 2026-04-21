import React, { type ReactElement, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  archiveState,
  formatDateTime,
  formatNum,
  historyState,
  type DashboardArchiveItem,
} from '../shared.js';
import {
  deleteArchivedAgentRecord,
  getArchiveRefreshToken,
  getHeatmapRefreshToken,
  hideTooltip,
  openArchivedAgentHistory,
  renderArchiveView,
  renderHeatmapView,
  showTooltip,
  subscribeArchiveView,
  subscribeHeatmapView,
} from '../activityViews.js';
import { type DashboardView } from '../state/store.js';

type HeatmapCell = {
  dateString: string;
  dayOfWeek: number;
  value: number;
};

type HeatmapModel = {
  activeDays: number;
  bestStreak: number;
  cells: HeatmapCell[];
  dayLabels: string[];
  monthNames: string[];
  nonZeroValues: number[];
  totalSessions: number;
};

type ArchiveCardModel = {
  item: DashboardArchiveItem;
  lastSession: NonNullable<DashboardArchiveItem['sessionHistory']>[number] | null;
  subtitle: string;
  typeBadge: ReactElement;
};

function viewClass(currentView: DashboardView, view: DashboardView): string {
  return `view-section${currentView === view ? ' active' : ''}`;
}

function toMillis(value: number | string | Date | null | undefined): number {
  if (value == null) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function useHeatmapRefreshToken(): number {
  return useSyncExternalStore(subscribeHeatmapView, getHeatmapRefreshToken, getHeatmapRefreshToken);
}

function useArchiveRefreshToken(): number {
  return useSyncExternalStore(subscribeArchiveView, getArchiveRefreshToken, getArchiveRefreshToken);
}

function buildHeatmapModel(): HeatmapModel {
  const days = historyState.data?.days || {};

  let totalSessions = 0;
  let activeDays = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  const dates = Object.keys(days).sort();
  for (const date of dates) {
    const sessionCount = days[date].sessions || 0;
    totalSessions += sessionCount;
    if (sessionCount > 0) {
      activeDays++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (52 * 7 + today.getDay()));

  const values: number[] = [];
  const cells: HeatmapCell[] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const dateString = cursor.toISOString().slice(0, 10);
    const value = days[dateString]?.sessions || 0;
    values.push(value);
    cells.push({ dateString, value, dayOfWeek: cursor.getDay() });
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    activeDays,
    bestStreak,
    cells,
    dayLabels: ['', 'Mon', '', 'Wed', '', 'Fri', ''],
    monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    nonZeroValues: values.filter((value) => value > 0).sort((left, right) => left - right),
    totalSessions,
  };
}

function getHeatmapLevel(value: number, nonZeroValues: number[]): number {
  if (value === 0 || nonZeroValues.length === 0) return 0;
  if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.25)] || 1) return 1;
  if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.5)] || 1) return 2;
  if (value <= nonZeroValues[Math.floor(nonZeroValues.length * 0.75)] || 1) return 3;
  return 4;
}

function buildArchiveCardModel(item: DashboardArchiveItem): ArchiveCardModel {
  const workspace = item.workspace || null;
  const sessionHistory = item.sessionHistory || [];
  const lastSession = sessionHistory.length > 0
    ? [...sessionHistory].sort((left, right) => toMillis(right.startedAt) - toMillis(left.startedAt))[0]
    : null;
  const subtitle = workspace
    ? (workspace.repositoryName || item.projectPath || '-')
    : (item.projectPath || item.role || '-');
  const typeBadge = workspace
    ? <span className="mc-type-badge workspace">WT {workspace.branch || '-'}</span>
    : <span className="mc-type-badge">Agent</span>;

  return {
    item,
    lastSession,
    subtitle,
    typeBadge,
  };
}

export function HeatmapView({ currentView }: { currentView: DashboardView }): ReactElement {
  const refreshToken = useHeatmapRefreshToken();
  const model = useMemo(() => buildHeatmapModel(), [refreshToken]);

  useEffect(() => {
    if (currentView === 'heatmap') {
      void renderHeatmapView();
    }
  }, [currentView]);

  return (
    <div id="heatmapView" className={viewClass(currentView, 'heatmap')}>
      <div className="panel heatmap-panel">
        <div className="heatmap-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Activity Mesh</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Historical agent session frequency over the past year.
            </div>
          </div>
          <div className="heatmap-stats-row" id="hmStatsRoot">
            <div className="hm-stat">
              <span className="hm-stat-lbl">Record Sessions</span>
              <span className="hm-stat-val">{formatNum(model.totalSessions)}</span>
            </div>
            <div className="hm-stat">
              <span className="hm-stat-lbl">Active Days</span>
              <span className="hm-stat-val">{model.activeDays}</span>
            </div>
            <div className="hm-stat">
              <span className="hm-stat-lbl">Longest Streak</span>
              <span className="hm-stat-val">{model.bestStreak} d</span>
            </div>
          </div>
        </div>

        <div className="heatmap-container-scroll">
          <div className="heatmap-grid" id="heatmapGrid">
            <div className="hm-month-lbl" />
            {model.dayLabels.map((label, index) => (
              <div key={`day-${index}`} className="hm-day-lbl">{label}</div>
            ))}
            {model.cells.map((cell, index) => {
              const currentDate = new Date(`${cell.dateString}T00:00:00`);
              if (cell.dayOfWeek === 0 || index === 0) {
                const month = currentDate.getMonth();
                const previousCell = index > 0 ? model.cells[index - 1] : null;
                const showMonth = index === 0 || !previousCell || new Date(`${previousCell.dateString}T00:00:00`).getMonth() !== month;
                return (
                  <React.Fragment key={cell.dateString}>
                    <div className="hm-month-lbl">{showMonth ? model.monthNames[month] : ''}</div>
                    <div
                      className={`hm-cell l${getHeatmapLevel(cell.value, model.nonZeroValues)}`}
                      data-ds={cell.dateString}
                      onMouseEnter={(event) => showTooltip(event.currentTarget, cell.dateString, historyState.data?.days?.[cell.dateString])}
                      onMouseLeave={hideTooltip}
                    />
                  </React.Fragment>
                );
              }

              return (
                <div
                  key={cell.dateString}
                  className={`hm-cell l${getHeatmapLevel(cell.value, model.nonZeroValues)}`}
                  data-ds={cell.dateString}
                  onMouseEnter={(event) => showTooltip(event.currentTarget, cell.dateString, historyState.data?.days?.[cell.dateString])}
                  onMouseLeave={hideTooltip}
                />
              );
            })}
          </div>
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
  );
}

export function ArchiveView({ currentView }: { currentView: DashboardView }): ReactElement {
  const refreshToken = useArchiveRefreshToken();

  useEffect(() => {
    if (currentView === 'archive') {
      void renderArchiveView();
    }
  }, [currentView]);

  const cards = useMemo(() => (archiveState.items || []).map(buildArchiveCardModel), [refreshToken]);
  const isLoading = archiveState.loading;

  return (
    <div id="archiveView" className={viewClass(currentView, 'archive')}>
      <div className="panel archive-panel">
        <div className="archive-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Registry Archive</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Archived agent records with session history and lifecycle totals.
            </div>
          </div>
          <button className="btn-secondary archive-refresh-btn" id="archiveRefreshBtn" type="button" onClick={() => { void renderArchiveView(true); }}>Refresh</button>
        </div>
        <div className="archive-grid" id="archiveGrid">
          {isLoading ? (
            <div className="standby-state">Loading archived agent records...</div>
          ) : cards.length === 0 ? (
            <div className="standby-state">No archived agent records yet.</div>
          ) : (
            cards.map((card) => (
              <article key={card.item.id} className="archive-card" data-registry-id={card.item.id}>
                <div className="archive-card-header">
                  <div>
                    <div className="archive-card-title">{card.item.name || 'Workspace'}</div>
                    <div className="archive-card-subtitle">{card.subtitle}</div>
                  </div>
                  {card.typeBadge}
                </div>
                {card.item.role ? <div className="archive-card-role">{card.item.role}</div> : null}
                <div className="archive-meta-grid">
                  <div><span>Archived</span><strong>{formatDateTime(card.item.archivedAt)}</strong></div>
                  <div><span>Last Start</span><strong>{formatDateTime(card.lastSession?.startedAt)}</strong></div>
                  <div><span>Last End</span><strong>{formatDateTime(card.lastSession?.endedAt)}</strong></div>
                </div>
                <div className="archive-card-actions">
                  <button className="agent-history-btn" type="button" onClick={() => openArchivedAgentHistory(card.item.id, card.item.name || 'Workspace')}>History</button>
                  <button className="agent-delete-btn archive-delete-btn" title="Delete archived record" type="button" onClick={() => { void deleteArchivedAgentRecord(card.item.id); }}>Delete</button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
