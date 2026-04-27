/**
 * UI State Persistence
 * Saves and restores lightweight UI state (e.g. overlay open/closed)
 * across app restarts. Stored in ~/.agent-office/ui-state.json,
 * consistent with the session state file location.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

interface UiState {
  overlayOpen?: boolean;
}

function getUiStatePath(): string {
  return path.join(os.homedir(), '.agent-office', 'ui-state.json');
}

function saveUiState(state: UiState): void {
  try {
    const statePath = getUiStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = statePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, statePath);
  } catch (e) {
    process.stderr.write(`[uiState] save error: ${e.message}\n`);
  }
}

function loadUiState(): UiState {
  try {
    const statePath = getUiStatePath();
    if (!fs.existsSync(statePath)) return {};
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as UiState;
  } catch {
    return {};
  }
}

export { saveUiState, loadUiState };
module.exports = { saveUiState, loadUiState };
