const fs = require('fs');
import type { DashboardDayStats } from '../shared/contracts/index.js';

const MAX_AGE_DAYS = 400;

type PersistedDayStats = DashboardDayStats & {
  projects?: string[];
  _sessions?: Set<string>;
  _projects?: Set<string>;
};

type HeatmapScannerLike = {
  persistDir: string;
  persistFile: string;
  days: Record<string, PersistedDayStats>;
  lastScan: number;
  fileOffsets: Record<string, number>;
  debugLog: (message: string) => void;
};

function roundCost(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function pruneOldDays(scanner: HeatmapScannerLike) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const dateKey of Object.keys(scanner.days)) {
    if (dateKey < cutoffStr) delete scanner.days[dateKey];
  }
}

function savePersisted(scanner: HeatmapScannerLike) {
  try {
    if (!fs.existsSync(scanner.persistDir)) {
      fs.mkdirSync(scanner.persistDir, { recursive: true });
    }

    const serialDays: Record<string, PersistedDayStats> = {};
    for (const [date, stats] of Object.entries(scanner.days)) {
      const { _sessions, _projects, ...rest } = stats;
      rest.estimatedCost = roundCost(rest.estimatedCost);
      if (rest.byModel) {
        for (const model of Object.keys(rest.byModel)) {
          rest.byModel[model].estimatedCost = roundCost(rest.byModel[model].estimatedCost);
        }
      }
      serialDays[date] = rest;
    }

    fs.writeFileSync(scanner.persistFile, JSON.stringify({
      days: serialDays,
      lastScan: scanner.lastScan,
      fileOffsets: scanner.fileOffsets,
    }), 'utf-8');
  } catch (e) {
    scanner.debugLog(`[HeatmapScanner] Failed to save: ${e.message}`);
  }
}

function loadPersisted(scanner: HeatmapScannerLike) {
  try {
    if (!fs.existsSync(scanner.persistFile)) return;
    const data = JSON.parse(fs.readFileSync(scanner.persistFile, 'utf-8'));
    if (data.days) {
      for (const [date, stats] of Object.entries(data.days) as Array<[string, PersistedDayStats]>) {
        scanner.days[date] = {
          ...stats,
          byModel: stats.byModel || {},
          _sessions: new Set(),
          _projects: new Set(stats.projects || []),
        };
      }
    }
    scanner.lastScan = data.lastScan || 0;
    scanner.fileOffsets = data.fileOffsets || {};
    scanner.debugLog(`[HeatmapScanner] Loaded ${Object.keys(scanner.days).length} day(s)`);
  } catch (e) {
    scanner.debugLog(`[HeatmapScanner] Failed to load persisted data: ${e.message}`);
  }
}

module.exports = { pruneOldDays, savePersisted, loadPersisted };
