/**
 * Session Persistence
 * state.json save/restore — recover active sessions on app restart
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const {
  getProviderDefinition,
  normalizeProvider,
  providerSupportsActiveSessionFileRecovery,
} = require('./providers/registry');

const CODEX_ACTIVE_FILE_WINDOW_MS = 30 * 60 * 1000;

function getPersistedStatePath() {
  return path.join(os.homedir(), '.agent-office', 'state.json');
}

function resolveSessionPath(sessionPath) {
  if (!sessionPath) return null;
  return sessionPath.startsWith('~')
    ? path.join(os.homedir(), sessionPath.slice(1))
    : sessionPath;
}

function isProviderProcess(pid, provider) {
  const definition = getProviderDefinition(provider);
  try {
    if (process.platform === 'win32') {
      const result = execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($p) { "$($p.Name)|$($p.CommandLine)" }`
      ], { timeout: 5000, encoding: 'utf-8' });
      if (!result) return false;
      const lower = result.toLowerCase();
      if (!lower.includes(definition.processPattern)) return false;
      if (definition.rejectWindowsApps && lower.includes('windowsapps')) return false;
      if (definition.windowsNodeProcessOnly) {
        return lower.startsWith('node.exe|');
      }
      return true;
    } else {
      const result = execFileSync('ps', ['-p', String(pid), '-o', 'command='],
        { timeout: 3000, encoding: 'utf-8' });
      if (!result) return false;
      const lower = result.toLowerCase();
      if (!lower.includes(definition.processPattern)) return false;
      if (definition.rejectMacApp && lower.includes(`${definition.processPattern}.app`)) return false;
      return true;
    }
  } catch (e) {
    return false;
  }
}

function isActiveSessionFile(sessionPath, maxAgeMs = CODEX_ACTIVE_FILE_WINDOW_MS) {
  const resolved = resolveSessionPath(sessionPath);
  if (!resolved) return false;
  try {
    const stat = fs.statSync(resolved);
    return (Date.now() - stat.mtimeMs) <= maxAgeMs;
  } catch {
    return false;
  }
}

function savePersistedState({ agentManager, sessionPids }) {
  if (!agentManager) return;
  const statePath = getPersistedStatePath();
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const agents = agentManager.getAllAgents();
  const state = {
    agents: agents,
    pids: Array.from(sessionPids.entries())
  };
  const tmpPath = statePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, statePath);
}

function recoverExistingSessions({ agentManager, sessionPids, firstPreToolUseDone, firstToolUseMaps, debugLog, errorHandler }) {
  if (!agentManager) return;
  const statePath = getPersistedStatePath();
  const toolUseMaps = [];
  if (firstPreToolUseDone instanceof Map) {
    toolUseMaps.push(firstPreToolUseDone);
  }
  if (Array.isArray(firstToolUseMaps)) {
    for (const map of firstToolUseMaps) {
      if (map instanceof Map && !toolUseMaps.includes(map)) {
        toolUseMaps.push(map);
      }
    }
  }

  if (!fs.existsSync(statePath)) {
    debugLog('[Recover] No persisted state found.');
    return;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw);
    const savedAgents = state.agents || [];
    const savedPids = new Map((state.pids || []));

    let recoveredCount = 0;
    for (const agent of savedAgents) {
      const provider = normalizeProvider(agent.provider, agent.provider ? null : undefined);
      if (!provider) {
        debugLog(`[Recover] Skipped agent (unknown provider): ${agent.id.slice(0, 8)}`);
        continue;
      }
      const restoredSessionId = agent.sessionId || agent.id;
      const restoredRegistryId = agent.registryId || (agent.isRegistered ? agent.id : null);

      const pid = Number(savedPids.get(agent.id) || savedPids.get(restoredSessionId) || 0);

      if (!pid) {
        if (providerSupportsActiveSessionFileRecovery(provider) && isActiveSessionFile(agent.jsonlPath)) {
          debugLog(`[Recover] Recovering ${provider} agent without pid via active session file: ${agent.id.slice(0, 8)}`);
        } else {
          debugLog(`[Recover] Skipped agent (no pid): ${agent.id.slice(0, 8)}`);
          continue;
        }
      }

      if (pid) {
        try {
          process.kill(pid, 0);
        } catch (e) {
          if (providerSupportsActiveSessionFileRecovery(provider) && isActiveSessionFile(agent.jsonlPath)) {
            debugLog(`[Recover] ${provider} pid gone but session file still active: ${agent.id.slice(0, 8)}`);
          } else {
            debugLog(`[Recover] Skipped dead agent (pid gone): ${agent.id.slice(0, 8)}`);
            continue;
          }
        }
      }

      if (pid && !isProviderProcess(pid, provider)) {
        if (providerSupportsActiveSessionFileRecovery(provider) && isActiveSessionFile(agent.jsonlPath)) {
          debugLog(`[Recover] ${provider} pid=${pid} did not match process signature, recovering from active session file: ${agent.id.slice(0, 8)}`);
        } else {
          debugLog(`[Recover] Skipped agent (pid=${pid} is not ${provider}): ${agent.id.slice(0, 8)}`);
          continue;
        }
      }

      if (pid) {
        sessionPids.set(restoredSessionId, pid);
      }
      for (const map of toolUseMaps) {
        map.set(restoredSessionId, true);
      }

      agentManager.updateAgent({
        registryId: restoredRegistryId,
        sessionId: restoredSessionId,
        runtimeSessionId: agent.runtimeSessionId,
        resumeSessionId: agent.resumeSessionId,
        projectPath: agent.projectPath,
        displayName: agent.displayName,
        state: agent.state,
        provider,
        jsonlPath: agent.jsonlPath,
        isTeammate: agent.isTeammate,
        isSubagent: agent.isSubagent,
        parentId: agent.parentId
      }, 'recover');

      recoveredCount++;
      debugLog(`[Recover] Restored: ${agent.id.slice(0, 8)} (${agent.displayName}) state=${agent.state} pid=${pid || 'none'} provider=${provider} (will re-verify via liveness)`);
    }

    debugLog(`[Recover] Done — ${recoveredCount} session(s) restored from state.json`);
  } catch (e) {
    errorHandler.capture(e, {
      code: 'E009',
      category: 'FILE_IO',
      severity: 'WARNING'
    });
    debugLog(`[Recover] Error reading or parsing state.json: ${e.message}`);
  }

  // Reset state.json after recovering agents
  try {
    const tmpPath = statePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify({ agents: [], pids: [] }, null, 2), 'utf-8');
    fs.renameSync(tmpPath, statePath);
    debugLog('[Recover] state.json reset after recovery');
  } catch (e) { process.stderr.write(`[session-persist] reset error: ${e.message}\n`); }
}

module.exports = { savePersistedState, recoverExistingSessions };
