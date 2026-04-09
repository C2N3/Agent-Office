export const REGISTERED_FILTER_STORAGE_KEY = 'mc-filter-registered-only';
export const SHARED_AVATAR_FILES = ['avatar_0.webp', 'avatar_1.webp', 'avatar_2.webp', 'avatar_3.webp'];
export const state = {
    agents: new Map(),
    agentHistory: new Map(),
    stats: { total: 0, active: 0, completed: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
    connected: false,
    currentView: localStorage.getItem('mc-view') || 'office',
    filters: {
        registeredOnly: localStorage.getItem(REGISTERED_FILTER_STORAGE_KEY) !== 'false'
    }
};
export const archiveState = {
    items: null,
    loading: false,
};
export const historyState = { data: null, mode: 'weeks' };
export const termState = {
    terminals: new Map(),
    activeId: null,
    dataCleanup: null,
    exitCleanup: null,
    profiles: [],
    defaultProfileId: null,
};
export function getElementById(id) {
    return document.getElementById(id);
}
export const DOM = {
    statusIndicator: getElementById('statusIndicator'),
    connectionStatus: getElementById('connectionStatus'),
    agentPanel: getElementById('agentPanel'),
    standbyMessage: getElementById('standbyMessage'),
    kpiActiveAgents: getElementById('kpiActiveAgents'),
    kpiTotalAgents: getElementById('kpiTotalAgents'),
    kpiTokens: getElementById('kpiTokens'),
    kpiCost: getElementById('kpiCost'),
    kpiErrors: getElementById('kpiErrors'),
    officeFilterBadge: getElementById('officeFilterBadge'),
    agentListFilterBadge: getElementById('agentListFilterBadge'),
    officeFilterToggle: getElementById('officeRegisteredFilterToggle'),
    agentListFilterToggle: getElementById('agentListRegisteredFilterToggle'),
    bulkArchiveBtn: getElementById('bulkArchiveBtn'),
    archiveGrid: getElementById('archiveGrid'),
    archiveRefreshBtn: getElementById('archiveRefreshBtn'),
};
export const dashboardResumeUtils = globalThis.dashboardResumeUtils || {};
export function getDashboardAPI() {
    return globalThis.dashboardAPI;
}
export function formatNum(n) {
    if (n >= 1000000)
        return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)
        return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}
export function formatDateTime(ts) {
    if (!ts)
        return '-';
    try {
        return new Date(ts).toLocaleString();
    }
    catch {
        return '-';
    }
}
export function escapeText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export function createDiv(cls, txt) {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = txt;
    return div;
}
