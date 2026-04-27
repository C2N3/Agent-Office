/**
 * Heatmap Scanner
 * Scans JSONL transcripts under Claude and Codex session roots to aggregate
 * daily activity statistics (sessions, messages, tool usage, tokens, cost).
 * Provides data for GitHub contribution graph-style heatmap.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getRoots,
  listJsonlFiles,
  loadPersisted,
  pruneOldDays,
  savePersisted,
  scanFile,
} from './helpers';
import type { DashboardDayStats } from '../shared/contracts/index';

type HeatmapDayStats = DashboardDayStats & {
  _sessions?: Set<string>;
  _projects?: Set<string>;
};

export class HeatmapScanner {
  declare debugLog: (message: string) => void;
  declare scanInterval: NodeJS.Timeout | null;
  declare persistDir: string;
  declare persistFile: string;
  declare days: Record<string, HeatmapDayStats>;
  declare lastScan: number;
  declare fileOffsets: Record<string, number>;

  constructor(debugLog: (message: string) => void = () => {}) {
    this.debugLog = debugLog;
    this.scanInterval = null;
    this.persistDir = path.join(os.homedir(), '.agent-office');
    this.persistFile = path.join(this.persistDir, 'heatmap.json');
    this.days = {};
    this.lastScan = 0;
    this.fileOffsets = {};

    loadPersisted(this);
  }

  start(intervalMs = 300_000) {
    this.debugLog('[HeatmapScanner] Started');
    this.scanAll();
    this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    savePersisted(this);
    this.debugLog('[HeatmapScanner] Stopped');
  }

  async scanAll() {
    const roots = this._getRoots();
    if (roots.length === 0) {
      if (!fs.existsSync(this.persistFile)) {
        this.days = {};
        this.fileOffsets = {};
      }
      this.debugLog('[HeatmapScanner] No transcript roots found');
      return;
    }

    const jsonlFiles = [];
    for (const root of roots) {
      jsonlFiles.push(...listJsonlFiles(root));
    }

    const uniqueFiles = [...new Set(jsonlFiles)];
    if (uniqueFiles.length === 0 && !fs.existsSync(this.persistFile)) {
      this.days = {};
      this.fileOffsets = {};
      this.lastScan = Date.now();
      return;
    }

    let newEntries = 0;
    for (const filePath of uniqueFiles) {
      try {
        newEntries += this._scanFile(filePath);
      } catch (e) {
        this.debugLog(`[HeatmapScanner] Error scanning ${filePath}: ${e.message}`);
      }
    }

    this.lastScan = Date.now();
    this._pruneOldDays();

    if (newEntries > 0) {
      this.debugLog(`[HeatmapScanner] Scanned ${uniqueFiles.length} files, ${newEntries} new entries`);
      savePersisted(this);
    }
  }

  getDailyStats() {
    return { days: this.days, lastScan: this.lastScan };
  }

  getRange(startDate, endDate) {
    const result = {};
    for (const [date, stats] of Object.entries(this.days)) {
      if (date >= startDate && date <= endDate) {
        result[date] = stats;
      }
    }
    return result;
  }

  _getRoots() {
    return getRoots();
  }

  _scanFile(filePath) {
    return scanFile(this, filePath);
  }

  _pruneOldDays() {
    pruneOldDays(this);
  }

  _savePersisted() {
    savePersisted(this);
  }

  _loadPersisted() {
    loadPersisted(this);
  }
}
