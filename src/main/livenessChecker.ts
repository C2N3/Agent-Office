/**
 * Liveness Checker
 * PID detection, session-file re-verification, 2-second interval process liveness check
 */

import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasActiveOrchestratorTask, removeOrOffline } from './liveness/agents';
import { sharedSessionAllowlist } from './orchestrator/sessionAllowlist';
import { getProviderDefinition, normalizeProvider } from './providers/registry';
import { resolveFromModule } from '../runtime/module';

const sessionPids = new Map(); // sessionId → actual CLI process PID

async function checkLivenessTier1(agentId, pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Function to accurately find the CLI PID for a session using its JSONL file.
 * Linux/macOS: lsof -t <path>
 * Windows: Restart Manager API (find-file-owner.ps1)
 */
function detectProviderPidBySessionFile(provider, jsonlPath, callback) {
  const resolvedProvider = normalizeProvider(provider, null);
  if (!resolvedProvider) {
    callback(null);
    return;
  }

  if (!jsonlPath) {
    detectProviderPidsFallback(resolvedProvider, callback);
    return;
  }

  const resolved = jsonlPath.startsWith('~')
    ? path.join(os.homedir(), jsonlPath.slice(1))
    : jsonlPath;

  if (process.platform === 'win32') {
    const scriptPath = resolveFromModule(import.meta.url, '..', 'find-file-owner.ps1');
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
  const definition = getProviderDefinition(provider);
  const providerPattern = definition.processPattern;

  // Task-only gate: when the orchestrator has registered any task session,
  // only return PIDs that belong to those tasks. This keeps Gemini (and any
  // other provider lacking a session-file or hook channel) from attaching
  // to an unrelated process the user happened to be running.
  const filterPids = (pids) => {
    if (!Array.isArray(pids) || pids.length === 0) return null;
    if (sharedSessionAllowlist.size() === 0) return pids;
    const filtered = pids.filter((p) => sharedSessionAllowlist.hasPid(p));
    return filtered.length > 0 ? filtered : null;
  };

  if (process.platform === 'win32') {
    const psCmd = definition.windowsNodeProcessOnly
      ? `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${providerPattern}*' } | Select-Object -ExpandProperty ProcessId`
      : `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${providerPattern}*' } | Select-Object -ExpandProperty ProcessId`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout) return callback(null);
      const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
      callback(filterPids(pids));
    });
  } else {
    const pattern = definition.unixProcessPattern;
    execFile('pgrep', ['-f', pattern], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return callback(null);
      const pids = stdout.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
      callback(filterPids(pids));
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
  const definition = getProviderDefinition(provider);
  const providerPattern = definition.processPattern;
  if (process.platform === 'win32') {
    const psCmd = definition.windowsNodeProcessOnly
      ? `(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${providerPattern}*' }).Count`
      : `(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${providerPattern}*' }).Count`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout) return callback(0);
      callback(parseInt(stdout.trim(), 10) || 0);
    });
  } else {
    const pattern = definition.unixProcessPattern;
    execFile('pgrep', ['-fc', pattern], { timeout: 3000 }, (err, stdout) => {
      callback(parseInt((stdout || '').trim(), 10) || 0);
    });
  }
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
function zombieSweep(agentManager, agentRegistry, taskStore, debugLog) {
  if (_zombieSweepRunning) return;
  _zombieSweepRunning = true;

  const providerAgents = new Map();
  for (const agent of agentManager.getAllAgents()) {
    if (agent.isSubagent) continue;
    if (agent.isRegistered && agent.state === 'Offline') continue;
    // Skip agents managed by Orchestrator or in a team
    if (hasActiveOrchestratorTask(taskStore, agent)) continue;
    if (agent.teamId) continue;
    // Skip agents with a live terminal — terminal is the source of truth
    const termId = agent.registryId || agent.id;
    if (_terminalManagerRef?.hasTerminal?.(termId)) continue;
    const provider = normalizeProvider(agent.provider, agent.provider ? null : undefined);
    if (!provider) continue;
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
          removeOrOffline(agentManager, agentRegistry, agent, debugLog);
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
let _terminalManagerRef = null;

function startLivenessChecker({ agentManager, agentRegistry, taskStore, terminalManager, debugLog }) {
  _terminalManagerRef = terminalManager || null;
  const zombieSweepId = setInterval(() => {
    if (agentManager) zombieSweep(agentManager, agentRegistry, taskStore, debugLog);
  }, ZOMBIE_SWEEP_INTERVAL);

  const livenessCheckId = setInterval(async () => {
    if (!agentManager) return;
    for (const agent of agentManager.getAllAgents()) {
      const provider = normalizeProvider(agent.provider, agent.provider ? null : undefined);
      if (!provider) continue;
      // Skip offline registered agents — they have no session to check
      if (agent.isRegistered && agent.state === 'Offline') continue;
      if (agent.firstSeen && (Date.now() - agent.firstSeen) < GRACE_MS) continue;

      // If the agent has a live terminal, it's definitely online — skip liveness checks
      const termId = agent.registryId || agent.id;
      if (terminalManager?.hasTerminal?.(termId)) continue;

      // Skip agents in a team — TeamCoordinator manages their lifecycle
      if (agent.teamId) continue;

      // For registered agents, PID is stored under sessionId, not registryId
      const pidKey = agent.sessionId || agent.id;
      const pid = sessionPids.get(pidKey) || sessionPids.get(agent.id);
      if (!pid) {
        // Registered agents without a session have no PID — skip, don't penalize
        if (agent.isRegistered && !agent.sessionId) continue;

        // Skip agents managed by the Orchestrator (terminal PID not tracked via Hook)
        if (hasActiveOrchestratorTask(taskStore, agent)) continue;

        retryPidDetection(pidKey, provider, agentManager, debugLog);
        const noPidAge = Date.now() - (agent.firstSeen || 0);
        if (noPidAge > NO_PID_TIMEOUT) {
          // Solo agent protection only applies to ephemeral agents.
          if (!agent.isRegistered && agentManager.getAgentCount() <= 1) {
            debugLog(`[Live] ${agent.id.slice(0, 8)} no PID but solo agent → keeping`);
            continue;
          }
          debugLog(`[Live] ${agent.id.slice(0, 8)} no PID for ${Math.round(noPidAge/1000)}s → removing`);
          removeOrOffline(agentManager, agentRegistry, agent, debugLog);
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
        removeOrOffline(agentManager, agentRegistry, agent, debugLog);
      }
    }
  }, LIVENESS_INTERVAL);

  return { zombieSweepId, livenessCheckId };
}

export {
  sessionPids,
  startLivenessChecker,
  detectClaudePidByTranscript,
  detectProviderPidBySessionFile,
};
