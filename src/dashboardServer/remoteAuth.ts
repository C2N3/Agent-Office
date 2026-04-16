import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_DIR = path.join(os.homedir(), '.agent-office');
const TOKEN_FILE = path.join(CONFIG_DIR, 'remote-token.txt');

let _token: string | null = null;

export function loadOrCreateToken(): string {
  if (_token) return _token;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (fs.existsSync(TOKEN_FILE)) {
    const existing = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (existing) {
      _token = existing;
      return _token;
    }
  }

  _token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, _token, 'utf-8');
  return _token;
}

export function getRemoteToken(): string {
  return _token || loadOrCreateToken();
}

export function isValidToken(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const valid = getRemoteToken();
  if (candidate.length !== valid.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(valid));
  } catch {
    return false;
  }
}

export function extractToken(req: any): string | null {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const header = req.headers['x-remote-token'];
  if (header) return Array.isArray(header) ? header[0] : header;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}
