/**
 * Liveness Checker
 * PID detection, session-file re-verification, 2-second interval process liveness check
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const sessionPids = new Map(); // sessionId → actual CLI process PID
const KNOWN_PROVIDERS = new Set(['claude', 'codex']);

async function checkLivenessTier1(agentId, pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function getProviderPattern(provider) {
  return provider === 'codex' ? 'codex' : 'claude';
}

/**
 * Function to accurately find the CLI PID for a session using its JSONL file.
 * Linux/macOS: lsof -t <path>
 * Windows: Restart Manager API (find-file-owner.ps1)
 */
function detectProviderPidBySessionFile(provider, jsonlPath, callback) {
  const { execFile } = require('child_process');
  const resolvedProvider = KNOWN_PROVIDERS.has(provider) ? provider : 'claude';

  if (!jsonlPath) {
    detectProviderPidsFallback(resolvedProvider, callback);
    return;
  }

  const resolved = jsonlPath.startsWith('~')
    ? path.join(os.homedir(), jsonlPath.slice(1))
    : jsonlPath;

  if (process.platform === 'win32') {
    const scriptPath = path.join(__dirname, '..', 'find-file-owner.ps1');
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-FilePath', resolved],
      { timeout: 5000 }, (err, stdout) => {
      if (!err && stdout) {
        const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
        if (pids.length > 0) {
          return callback(pids[0]);
        }
      }
      detectProviderPidsFallback(resolvedProvider, callback);
    });
  } else {
    execFile('lsof', ['-t', resolved], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout) {
        const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
        if (pids.length > 0) {
          return callback(pids[0]);
        }
      }
      detectProviderPidsFallback(resolvedProvider, callback);
    });
  }
}

function detectProviderPidsFallback(provider, callback) {
  const { execFile } = require('child_process');
  const providerPattern = getProviderPattern(provider);
  if (process.platform === 'win32') {
    const psCmd = provider === 'claude'
      ? `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${providerPattern}*' } | Select-Object -ExpandProperty ProcessId`
      : `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${providerPattern}*' } | Select-Object -ExpandProperty ProcessId`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout) return callback(null);
      const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
      callback(pids.length > 0 ? pids : null);
    });
  } else {
    const pattern = provider === 'claude' ? 'node.*claude' : providerPattern;
    execFile('pgrep', ['-f', pattern], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return callback(null);
      const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
      callback(pids.length > 0 ? pids : null);
    });
  }
}

function detectClaudePidByTranscript(jsonlPath, callback) {
  detectProviderPidBySessionFile('claude', jsonlPath, callback);
}

// Re-detect agents with unregistered PIDs (prevent duplicate execution)
const _pidRetryRunning = new Set();
function retryPidDetection(sessionId, provider, agentManager, debugLog) {
  if (_pidRetryRunning.has(sessionId) || sessionPids.has(sessionId)) return;
  _pidRetryRunning.add(sessionId);

  const agent = agentManager ? agentManager.getAgent(sessionId) : null;
  const jsonlPath = agent ? agent.jsonlPath : null;

  detectProviderPidBySessionFile(provider, jsonlPath, (result) => {
    _pidRetryRunning.delete(sessionId);
    if (!result) return;

    if (typeof result === 'number') {
      sessionPids.set(sessionId, result);
      debugLog(`[Live] PID assigned via transcript: ${sessionId.slice(0, 8)} → pid=${result}`);
    } else if (Array.isArray(result)) {
      const registeredPids = new Set(sessionPids.values());
      const newPid = result.find(p => !registeredPids.has(p));
      if (newPid) {
        sessionPids.set(sessionId, newPid);
        debugLog(`[Live] PID assigned via fallback: ${sessionId.slice(0, 8)} → pid=${newPid}`);
      }
    }
  });
}

/**
 * Count running provider CLI processes.
 */
function countProviderProcesses(provider, callback) {
  const { execFile } = require('child_process');
  const providerPattern = getProviderPattern(provider);
  if (process.platform === 'win32') {
    const psCmd = provider === 'claude'
      ? `(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${providerPattern}*' }).Count`
      : `(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${providerPattern}*' }).Count`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout) return callback(0);
      callback(parseInt(stdout.trim(), 10) || 0);
    });
  } else {
    const pattern = provider === 'claude' ? 'node.*claude' : providerPattern;
    execFile('pgrep', ['-fc', pattern], { timeout: 3000 }, (err, stdout) => {
      callback(parseInt((stdout || '').trim(), 10) || 0);
    });
  }
}

function countClaudeProcesses(callback) {
  countProviderProcesses('claude', callback);
}

/**
 * Get jsonl file mtime (0 if not found)
 */
function getJsonlMtime(jsonlPath) {
  if (!jsonlPath) return 0;
  try {
    const resolved = jsonlPath.startsWith('~')
      ? path.join(os.homedir(), jsonlPath.slice(1))
      : jsonlPath;
    return fs.statSync(resolved).mtimeMs;
  } catch { return 0; }
}

// Zombie sweep: compare process count vs main agent count, remove oldest by mtime
let _zombieSweepRunning = false;
function zombieSweep(agentManager, debugLog) {
  if (_zombieSweepRunning) return;
  _zombieSweepRunning = true;

  const providerAgents = new Map();
  for (const agent of agentManager.getAllAgents()) {
    if (agent.isSubagent) continue;
    if (agent.isRegistered && agent.state === 'Offline') continue;
    const provider = KNOWN_PROVIDERS.has(agent.provider) ? agent.provider : 'claude';
    if (!providerAgents.has(provider)) {
      providerAgents.set(provider, []);
    }
    providerAgents.get(provider).push(agent);
  }

  const providers = Array.from(providerAgents.entries()).filter(([, agents]) => agents.length > 1);
  if (providers.length === 0) {
    _zombieSweepRunning = false;
    return;
  }

  let pending = providers.length;
  for (const [provider, mainAgents] of providers) {
    countProviderProcesses(provider, (processCount) => {
      if (processCount < mainAgents.length) {
        const excess = mainAgents.length - processCount;
        debugLog(`[Live] Zombie sweep(${provider}): ${processCount} processes, ${mainAgents.length} agents → ${excess} excess`);

        const sorted = mainAgents
          .map(a => ({ agent: a, mtime: getJsonlMtime(a.jsonlPath) }))
          .sort((a, b) => a.mtime - b.mtime);

        for (let i = 0; i < excess; i++) {
          const record = sorted[i];
          if (!record) break;
          const { agent } = record;
          const pidKey = agent.sessionId || agent.id;
          debugLog(`[Live] Zombie sweep(${provider}): removing ${agent.id.slice(0, 8)} (mtime=${new Date(record.mtime).toISOString()})`);
          sessionPids.delete(pidKey);
          removeOrOffline(agentManager, agent, debugLog);
        }
      }

      pending--;
      if (pending === 0) {
        _zombieSweepRunning = false;
      }
    });
  }
}

const LIVENESS_INTERVAL = 2000;
const GRACE_MS = 10000;
const ZOMBIE_SWEEP_INTERVAL = 30000;
const NO_PID_TIMEOUT = GRACE_MS + 10000;

/** Remove or transition agent based on registration status */
function removeOrOffline(agentManager, agent, debugLog) {
  if (agent.isRegistered) {
    agentManager.transitionToOffline(agent.id);
    debugLog(`[Live] ${agent.id.slice(0, 8)} (registered) → Offline`);
  } else {
    agentManager.removeAgent(agent.id);
  }
}

function startLivenessChecker({ agentManager, debugLog }) {
  const zombieSweepId = setInterval(() => {
    if (agentManager) zombieSweep(agentManager, debugLog);
  }, ZOMBIE_SWEEP_INTERVAL);

  const livenessCheckId = setInterval(async () => {
    if (!agentManager) return;
    for (const agent of agentManager.getAllAgents()) {
      const provider = KNOWN_PROVIDERS.has(agent.provider) ? agent.provider : 'claude';
      // Skip offline registered agents — they have no session to check
      if (agent.isRegistered && agent.state === 'Offline') continue;
      if (agent.firstSeen && (Date.now() - agent.firstSeen) < GRACE_MS) continue;

      // For registered agents, PID is stored under sessionId, not registryId
      const pidKey = agent.sessionId || agent.id;
      const pid = sessionPids.get(pidKey) || sessionPids.get(agent.id);
      if (!pid) {
        // Registered agents without a session have no PID — skip, don't penalize
        if (agent.isRegistered && !agent.sessionId) continue;

        retryPidDetection(pidKey, provider, agentManager, debugLog);
        const noPidAge = Date.now() - (agent.firstSeen || 0);
        if (noPidAge > NO_PID_TIMEOUT) {
          // Solo agent protection: don't remove the only agent
          if (agentManager.getAgentCount() <= 1) {
            debugLog(`[Live] ${agent.id.slice(0, 8)} no PID but solo agent → keeping`);
            continue;
          }
          debugLog(`[Live] ${agent.id.slice(0, 8)} no PID for ${Math.round(noPidAge/1000)}s → removing`);
          removeOrOffline(agentManager, agent, debugLog);
        }
        continue;
      }

      const alive = await checkLivenessTier1(agent.id, pid);
      if (alive) {
        if (agent.state === 'Offline') {
          agentManager.updateAgent({ ...agent, state: 'Waiting' }, 'live');
        }
        continue;
      }

      debugLog(`[Live] ${agent.id.slice(0, 8)} pid=${pid} dead → re-checking via session file`);
      const newPid = await new Promise((resolve) => {
        detectProviderPidBySessionFile(provider, agent.jsonlPath, (result) => {
          if (typeof result === 'number') resolve(result);
          else if (Array.isArray(result)) {
            const registeredPids = new Set(sessionPids.values());
            resolve(result.find(p => !registeredPids.has(p) && p !== pid) || null);
          } else resolve(null);
        });
      });

      if (newPid) {
        sessionPids.set(pidKey, newPid);
        debugLog(`[Live] ${agent.id.slice(0, 8)} PID renewed: ${pid} → ${newPid}`);
        if (agent.state === 'Offline') {
          agentManager.updateAgent({ ...agent, state: 'Waiting' }, 'live');
        }
      } else {
        debugLog(`[Live] ${agent.id.slice(0, 8)} confirmed dead → removing`);
        sessionPids.delete(pidKey);
        removeOrOffline(agentManager, agent, debugLog);
      }
    }
  }, LIVENESS_INTERVAL);

  return { zombieSweepId, livenessCheckId };
}

module.exports = {
  sessionPids,
  startLivenessChecker,
  detectClaudePidByTranscript,
  detectProviderPidBySessionFile,
};
