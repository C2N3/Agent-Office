describe('dashboard activity views react boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };

    const { archiveState, historyState } = require('../src/client/dashboard/shared.ts');

    historyState.data = {
      days: {
        '2026-04-18': { sessions: 3 },
        '2026-04-19': { sessions: 0 },
      },
    };
    archiveState.items = [
      {
        id: 'arch-1',
        name: 'Archived Agent',
        projectPath: '/tmp/archived',
        role: 'Review',
        archivedAt: '2026-04-19T12:00:00Z',
        sessionHistory: [
          {
            startedAt: '2026-04-18T10:00:00Z',
            endedAt: '2026-04-18T11:00:00Z',
          },
        ],
      },
    ];
    archiveState.loading = false;
  });

  afterEach(() => {
    delete global.localStorage;
  });

  test('renders the React-owned heatmap and archive shells with stable ids', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { ArchiveView, HeatmapView } = require('../src/client/dashboard/root/activityViews.tsx');

    const heatmapMarkup = renderToStaticMarkup(
      React.createElement(HeatmapView, { currentView: 'heatmap' }),
    );
    const archiveMarkup = renderToStaticMarkup(
      React.createElement(ArchiveView, { currentView: 'archive' }),
    );

    expect(heatmapMarkup).toContain('id="hmStatsRoot"');
    expect(heatmapMarkup).toContain('id="heatmapGrid"');
    expect(heatmapMarkup).toContain('class="hm-stat-val"');

    expect(archiveMarkup).toContain('id="archiveRefreshBtn"');
    expect(archiveMarkup).toContain('id="archiveGrid"');
    expect(archiveMarkup).toContain('data-delete-id="arch-1"');
    expect(archiveMarkup).toContain('Archived Agent');
  });
});
