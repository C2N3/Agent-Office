import path from 'path';
import { moduleDirname } from '../runtime/module';

export const PORT = Number(process.env.AO_DASHBOARD_PORT || 3000);

const runtimeRoot = path.resolve(moduleDirname(import.meta.url), '..', '..');

export const APP_ROOT = path.basename(runtimeRoot) === 'dist'
  ? path.resolve(runtimeRoot, '..')
  : runtimeRoot;
export const PROJECT_ROOT = runtimeRoot;
export const ASSET_ROOT = path.join(PROJECT_ROOT, 'assets');
const BROWSER_ROOT = path.basename(runtimeRoot) === 'dist'
  ? PROJECT_ROOT
  : path.join(PROJECT_ROOT, 'src', 'browser');

export const HTML_FILE = path.join(BROWSER_ROOT, 'dashboard.html');
export const REMOTE_FILE = path.join(BROWSER_ROOT, 'remote.html');
export const PIP_FILE = path.join(BROWSER_ROOT, 'pip.html');
export const OVERLAY_FILE = path.join(BROWSER_ROOT, 'overlay.html');
export const TASK_CHAT_FILE = path.join(BROWSER_ROOT, 'taskChat.html');

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
