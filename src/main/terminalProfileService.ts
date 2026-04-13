/**
 * Terminal Profile Service
 * Detects available shell profiles and persists the user's default profile.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PERSIST_DIR = path.join(os.homedir(), '.agent-office');
const PERSIST_FILE = path.join(PERSIST_DIR, 'terminal-preferences.json');

type TerminalProfile = {
  id: string;
  title: string;
  command: string;
  args: string[];
};

class TerminalProfileService {
  declare debugLog: (message: string) => void;
  declare preferences: { defaultProfileId: string | null };
  declare profileCache: TerminalProfile[] | null;

  constructor(debugLog) {
    this.debugLog = debugLog || (() => {});
    this.preferences = { defaultProfileId: null };
    this.profileCache = null;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.defaultProfileId === 'string' && parsed.defaultProfileId.trim()) {
        this.preferences.defaultProfileId = parsed.defaultProfileId.trim();
      }
    } catch (e) {
      this.debugLog(`[TerminalProfileService] Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(PERSIST_DIR)) {
        fs.mkdirSync(PERSIST_DIR, { recursive: true });
      }
      const tmpPath = PERSIST_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.preferences, null, 2), 'utf-8');
      fs.renameSync(tmpPath, PERSIST_FILE);
    } catch (e) {
      this.debugLog(`[TerminalProfileService] Save error: ${e.message}`);
    }
  }

  _runLookup(command, args) {
    try {
      const output = execFileSync(command, args, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  _resolveExecutable(candidates = []) {
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.includes(path.sep) || /^[A-Za-z]:\\/.test(candidate)) {
        if (fs.existsSync(candidate)) return candidate;
        continue;
      }

      if (process.platform === 'win32') {
        const matches = this._runLookup('where.exe', [candidate]);
        if (matches.length > 0) return matches[0];
      } else {
        const matches = this._runLookup('which', [candidate]);
        if (matches.length > 0) return matches[0];
      }
    }
    return null;
  }

  _dedupeProfiles(profiles) {
    const seenIds = new Set();
    const seenCommands = new Set();
    return profiles.filter(profile => {
      if (!profile || !profile.id || !profile.command) return false;
      if (seenIds.has(profile.id) || seenCommands.has(profile.command)) return false;
      seenIds.add(profile.id);
      seenCommands.add(profile.command);
      return true;
    });
  }

  _detectWindowsProfiles() {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const localGitDir = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git')
      : null;
    const resolvedGitExe = this._resolveExecutable(['git.exe', 'git']);
    const inferredGitRoot = resolvedGitExe
      ? path.resolve(path.dirname(resolvedGitExe), '..')
      : null;
    return this._dedupeProfiles([
      {
        id: 'pwsh',
        title: 'PowerShell 7',
        command: this._resolveExecutable([
          'pwsh.exe',
          'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
          'C:\\Program Files\\PowerShell\\6\\pwsh.exe',
        ]),
        args: [],
      },
      {
        id: 'powershell',
        title: 'Windows PowerShell',
        command: this._resolveExecutable([
          'powershell.exe',
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ]),
        args: [],
      },
      {
        id: 'cmd',
        title: 'Command Prompt',
        command: this._resolveExecutable([comspec, 'cmd.exe']),
        args: [],
      },
      {
        id: 'git-bash',
        title: 'Git Bash',
        command: this._resolveExecutable([
          inferredGitRoot ? path.join(inferredGitRoot, 'bin', 'bash.exe') : null,
          inferredGitRoot ? path.join(inferredGitRoot, 'git-bash.exe') : null,
          localGitDir ? path.join(localGitDir, 'bin', 'bash.exe') : null,
          localGitDir ? path.join(localGitDir, 'git-bash.exe') : null,
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files\\Git\\git-bash.exe',
          'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
          'C:\\Program Files (x86)\\Git\\git-bash.exe',
        ]),
        args: ['--login', '-i'],
      },
      {
        id: 'wsl',
        title: 'WSL',
        command: this._resolveExecutable(['wsl.exe']),
        args: [],
      },
    ]);
  }

  _detectUnixProfiles() {
    const shellFromEnv = process.env.SHELL || null;
    return this._dedupeProfiles([
      {
        id: 'zsh',
        title: 'zsh',
        command: this._resolveExecutable([shellFromEnv, 'zsh']),
        args: ['-l'],
      },
      {
        id: 'bash',
        title: 'bash',
        command: this._resolveExecutable([shellFromEnv, 'bash']),
        args: ['-l'],
      },
      {
        id: 'fish',
        title: 'fish',
        command: this._resolveExecutable([shellFromEnv, 'fish']),
        args: ['-l'],
      },
      {
        id: 'sh',
        title: 'sh',
        command: this._resolveExecutable([shellFromEnv, 'sh']),
        args: ['-l'],
      },
    ]);
  }

  _buildFallbackProfile() {
    if (process.platform === 'win32') {
      return {
        id: 'powershell-fallback',
        title: 'PowerShell',
        command: process.env.ComSpec || 'powershell.exe',
        args: [],
      };
    }

    return {
      id: 'shell-fallback',
      title: 'Shell',
      command: process.env.SHELL || '/bin/sh',
      args: ['-l'],
    };
  }

  _detectProfiles() {
    const profiles = process.platform === 'win32'
      ? this._detectWindowsProfiles()
      : this._detectUnixProfiles();
    return profiles.length > 0 ? profiles : [this._buildFallbackProfile()];
  }

  listProfiles() {
    if (!this.profileCache) {
      this.profileCache = this._detectProfiles();
      this.debugLog(`[TerminalProfileService] Detected ${this.profileCache.length} terminal profile(s)`);
    }
    return this.profileCache.map(profile => ({ ...profile, args: [...(profile.args || [])] }));
  }

  getDefaultProfileId() {
    const profiles = this.listProfiles();
    const stored = this.preferences.defaultProfileId;
    if (stored && profiles.some(profile => profile.id === stored)) {
      return stored;
    }
    return profiles[0]?.id || null;
  }

  getProfilesWithDefault() {
    const profiles = this.listProfiles();
    return {
      profiles,
      defaultProfileId: this.getDefaultProfileId(),
    };
  }

  resolveProfile(profileId) {
    const profiles = this.listProfiles();
    const preferredId = profileId || this.getDefaultProfileId();
    return profiles.find(profile => profile.id === preferredId) || profiles[0] || null;
  }

  setDefaultProfile(profileId) {
    const profile = this.resolveProfile(profileId);
    if (!profile || profile.id !== profileId) {
      throw new Error(`Unknown terminal profile: ${profileId}`);
    }

    this.preferences.defaultProfileId = profileId;
    this._save();
    this.debugLog(`[TerminalProfileService] Default profile set: ${profileId}`);
    return this.getProfilesWithDefault();
  }
}

module.exports = { TerminalProfileService };
