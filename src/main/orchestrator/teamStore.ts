// @ts-nocheck
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const TEAM_FILE = path.join(PERSIST_DIR, 'teams.json');

class TeamStore {
  constructor(debugLog) {
    this.debugLog = debugLog || (() => {});
    this.teams = new Map();
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(TEAM_FILE)) return;
      const raw = fs.readFileSync(TEAM_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.teams)) {
        for (const team of parsed.teams) {
          this.teams.set(team.id, team);
        }
        this.debugLog(`[TeamStore] Loaded ${this.teams.size} team(s)`);
      }
    } catch (e) {
      this.debugLog(`[TeamStore] Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(PERSIST_DIR)) {
        fs.mkdirSync(PERSIST_DIR, { recursive: true });
      }
      const data = {
        version: 1,
        teams: Array.from(this.teams.values()),
      };
      const tmpPath = TEAM_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, TEAM_FILE);
    } catch (e) {
      this.debugLog(`[TeamStore] Save error: ${e.message}`);
    }
  }

  createTeam(input) {
    const team = {
      id: crypto.randomUUID(),
      name: input.name || `Team-${Date.now().toString(36).slice(-5)}`,
      goal: input.goal || '',
      repositoryPath: input.repositoryPath || '',
      baseBranch: input.baseBranch || 'master',
      integrationBranch: null, // set during provisioning
      leaderAgentId: input.leaderAgentId || '',
      memberAgentIds: input.memberAgentIds || [],

      planningTaskId: null,
      subtaskIds: [],

      status: 'forming',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    this.teams.set(team.id, team);
    this._save();
    this.debugLog(`[TeamStore] Created team: ${team.id} "${team.name}"`);
    return team;
  }

  updateTeam(teamId, fields) {
    const team = this.teams.get(teamId);
    if (!team) return null;
    Object.assign(team, fields, { updatedAt: Date.now() });
    this._save();
    return team;
  }

  getTeam(teamId) {
    return this.teams.get(teamId) || null;
  }

  getAllTeams() {
    return Array.from(this.teams.values());
  }

  getActiveTeams() {
    return this.getAllTeams().filter(t => !['completed', 'failed', 'cancelled'].includes(t.status));
  }

  deleteTeam(teamId) {
    this.teams.delete(teamId);
    this._save();
  }
}

module.exports = { TeamStore };
