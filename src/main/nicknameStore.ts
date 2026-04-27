/**
 * Nickname Store
 * Persists agent nicknames to ~/.agent-office/nicknames.json
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'nicknames.json');

export class NicknameStore {
  declare debugLog: (message: string) => void;
  declare nicknames: Map<string, string>;

  constructor(debugLog) {
    this.debugLog = debugLog || (() => {});
    /** @type {Map<string, string>} sessionId → nickname */
    this.nicknames = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(PERSIST_FILE)) {
        const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            if (typeof v === 'string' && v.trim()) {
              this.nicknames.set(k, v.trim());
            }
          }
        }
        this.debugLog(`[NicknameStore] Loaded ${this.nicknames.size} nickname(s)`);
      }
    } catch (e) {
      this.debugLog(`[NicknameStore] Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(PERSIST_DIR)) {
        fs.mkdirSync(PERSIST_DIR, { recursive: true });
      }
      const obj = Object.fromEntries(this.nicknames);
      const tmpPath = PERSIST_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmpPath, PERSIST_FILE);
    } catch (e) {
      this.debugLog(`[NicknameStore] Save error: ${e.message}`);
    }
  }

  getNickname(sessionId) {
    return this.nicknames.get(sessionId) || null;
  }

  setNickname(sessionId, nickname) {
    const trimmed = (nickname || '').trim();
    if (!trimmed) {
      return this.removeNickname(sessionId);
    }
    this.nicknames.set(sessionId, trimmed);
    this._save();
    this.debugLog(`[NicknameStore] Set: ${sessionId.slice(0, 8)} → "${trimmed}"`);
    return trimmed;
  }

  removeNickname(sessionId) {
    if (this.nicknames.has(sessionId)) {
      this.nicknames.delete(sessionId);
      this._save();
      this.debugLog(`[NicknameStore] Removed: ${sessionId.slice(0, 8)}`);
    }
    return null;
  }

  rekeyNickname(fromSessionId, toSessionId) {
    if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) {
      return this.getNickname(toSessionId || fromSessionId);
    }

    const nickname = this.nicknames.get(fromSessionId);
    if (!nickname) return this.getNickname(toSessionId);

    this.nicknames.set(toSessionId, nickname);
    this.nicknames.delete(fromSessionId);
    this._save();
    this.debugLog(`[NicknameStore] Rekeyed: ${fromSessionId.slice(0, 8)} → ${toSessionId.slice(0, 8)}`);
    return nickname;
  }
}
