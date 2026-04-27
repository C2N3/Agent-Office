import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadCloudflaredPackageBin } from './nativeDependencies';

function findCloudflared(): string | null {
  // 1. npm cloudflared package (bundled with this project)
  try {
    const bin = loadCloudflaredPackageBin(require);
    if (bin && fs.existsSync(bin)) return bin;
  } catch {}

  // 2. Shell PATH lookup (works regardless of install method)
  try {
    const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = result.trim().split('\n')[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch {}

  // 3. WinGet packages directory (winget installs here but doesn't always update PATH immediately)
  if (process.platform === 'win32') {
    const wingetBase = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    try {
      if (fs.existsSync(wingetBase)) {
        for (const entry of fs.readdirSync(wingetBase)) {
          if (entry.toLowerCase().startsWith('cloudflare.cloudflared')) {
            const candidate = path.join(wingetBase, entry, 'cloudflared.exe');
            if (fs.existsSync(candidate)) return candidate;
          }
        }
      }
    } catch {}

    // 4. Common Windows install paths
    for (const p of [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
      path.join(os.homedir(), 'cloudflared', 'cloudflared.exe'),
    ]) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  error: string | null;
  startedAt: number | null;
  cloudflaredFound: boolean;
}

class TunnelManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private _url: string | null = null;
  private _error: string | null = null;
  private _startedAt: number | null = null;

  getStatus(): TunnelStatus {
    return {
      running: this.proc !== null,
      url: this._url,
      error: this._error,
      startedAt: this._startedAt,
      cloudflaredFound: findCloudflared() !== null,
    };
  }

  start(): { ok: boolean; message: string } {
    if (this.proc) return { ok: false, message: 'Tunnel already running' };

    this._url = null;
    this._error = null;
    this._startedAt = Date.now();

    const bin = findCloudflared();
    if (!bin) {
      this._error = 'cloudflared를 찾을 수 없습니다. npm install을 다시 실행해 주세요.';
      this._startedAt = null;
      return { ok: false, message: this._error };
    }

    try {
      this.proc = spawn(bin, ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (e: any) {
      this._error = 'cloudflared 실행 실패: ' + (e as Error).message;
      this._startedAt = null;
      return { ok: false, message: this._error };
    }

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !this._url) {
        this._url = match[0];
        this.emit('url', this._url);
        console.log(`[Tunnel] Public URL: ${this._url}`);
      }
    };

    this.proc.stdout?.on('data', handleOutput);
    this.proc.stderr?.on('data', handleOutput);

    this.proc.on('error', (err) => {
      this._error = err.message.includes('ENOENT')
        ? 'cloudflared not found. Install: winget install Cloudflare.cloudflared'
        : err.message;
      this.proc = null;
      this._url = null;
      this._startedAt = null;
      this.emit('stopped', this._error);
    });

    this.proc.on('exit', (code) => {
      const wasRunning = this.proc !== null;
      this.proc = null;
      this._url = null;
      this._startedAt = null;
      if (wasRunning && code !== 0 && !this._error) {
        this._error = `cloudflared exited with code ${code}`;
      }
      this.emit('stopped', this._error);
    });

    return { ok: true, message: 'Tunnel starting...' };
  }

  stop(): { ok: boolean; message: string } {
    if (!this.proc) return { ok: false, message: 'Tunnel not running' };
    this._error = null;
    this.proc.kill();
    this.proc = null;
    this._url = null;
    this._startedAt = null;
    this.emit('stopped', null);
    return { ok: true, message: 'Tunnel stopped' };
  }
}

// Singleton
const tunnelManager = new TunnelManager();
export { tunnelManager };
