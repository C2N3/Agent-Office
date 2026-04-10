// @ts-nocheck
const fs = require('fs');
const { ipcMain } = require('electron');
const { resolveResumeSessionId } = require('../sessionIdResolver');
const { resolveProjectPathForPlatform } = require('../../utils');
const { electronIpcChannels, dashboardIpcChannels } = require('../../shared/contracts/ipc');

const STALE_FOCUS_REPAIR_MS = 10_000;

function focusTerminalByPid(pid, label, debugLog) {
  const { execFile } = require('child_process');

  if (process.platform === 'win32') {
    const psScript = `
$memberDef = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);' +
  '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' +
  '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'
Add-Type -MemberDefinition $memberDef -Name W -Namespace FocusUtil -ErrorAction SilentlyContinue
$tpid = ${pid}
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 5; $i++) {
  $p = Get-Process -Id $tpid -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    $hwnd = $p.MainWindowHandle
    break
  }
  $pp = (Get-CimInstance Win32_Process -Filter "ProcessId = $tpid" -ErrorAction SilentlyContinue).ParentProcessId
  if (-not $pp -or $pp -eq 0 -or $pp -eq $tpid) { break }
  $tpid = $pp
}
if ($hwnd -ne [IntPtr]::Zero) {
  if ([FocusUtil.W]::IsIconic($hwnd)) { [FocusUtil.W]::ShowWindow($hwnd, 9) | Out-Null }
  [FocusUtil.W]::SetForegroundWindow($hwnd) | Out-Null
}
`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 5000 }, (err) => {
      if (err) debugLog(`[${label}] Focus error: ${err.message}`);
    });
    return;
  }

  if (process.platform === 'darwin') {
    const script = `
      tell application "System Events"
        set targetPid to ${pid}
        repeat 5 times
          try
            set proc to first process whose unix id is targetPid
            set frontmost of proc to true
            return
          end try
          try
            set targetPid to unix id of (first process whose unix id is targetPid)'s parent process
          on error
            exit repeat
          end try
        end repeat
      end tell
    `;
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err) => {
      if (err) debugLog(`[${label}] Focus error: ${err.message}`);
    });
    return;
  }

  const { exec } = require('child_process');
  exec(`wmctrl -i -a $(wmctrl -lp | awk '$3 == ${pid} {print $1; exit}') 2>/dev/null || xdotool search --pid ${pid} --onlyvisible windowactivate 2>/dev/null`, { timeout: 5000 }, (err) => {
    if (err) debugLog(`[${label}] Focus error (install wmctrl or xdotool): ${err.message}`);
  });
}

function buildResumeCommand(provider, sessionId) {
  if (!sessionId) return null;
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  return normalizedProvider === 'codex'
    ? `codex resume ${sessionId}\r`
    : `claude --resume ${sessionId}\r`;
}

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function toTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function findLatestResumableSessionEntry(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;

  let latest = null;
  let latestScore = -1;
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    if (!(entry?.resumeSessionId || entry?.sessionId || entry?.runtimeSessionId)) continue;
    const score = Math.max(
      toTimestamp(entry?.startedAt),
      toTimestamp(entry?.endedAt),
      index,
    );
    if (!latest || score > latestScore) {
      latest = entry;
      latestScore = score;
    }
  }

  return latest;
}

function registerRecoveryHandlers({
  agentManager,
  agentRegistry,
  sessionPids,
  windowManager,
  terminalProfileService,
  debugLog,
  isMainWindowSender,
}) {
  function canRecoverFocusedRegisteredAgent(agent) {
    if (!agent?.isRegistered || !agentRegistry) return false;

    const registryId = agent.registryId || agent.id;
    const registryAgent = agentRegistry.getAgent?.(registryId);
    if (!registryAgent) return false;

    if (
      agent.sessionId
      || agent.runtimeSessionId
      || agent.resumeSessionId
      || registryAgent.currentSessionId
      || registryAgent.currentRuntimeSessionId
      || registryAgent.currentResumeSessionId
    ) {
      return true;
    }

    const history = agentRegistry.getSessionHistory?.(registryId) || [];
    return history.some((entry) => entry?.resumeSessionId || entry?.sessionId || entry?.runtimeSessionId);
  }

  function resolveFocusContext(agentId) {
    const agent = agentManager?.getAgent(agentId) || null;
    const candidateKeys = Array.from(new Set([
      agentId,
      agent?.sessionId,
      agent?.runtimeSessionId,
      agent?.resumeSessionId,
    ].filter(Boolean)));

    for (const key of candidateKeys) {
      const pid = sessionPids.get(key);
      if (pid) {
        return { agent, pid, pidKey: key, candidateKeys };
      }
    }

    return { agent, pid: null, pidKey: null, candidateKeys };
  }

  function repairStaleFocusedAgent(agentId, label) {
    const agent = agentManager?.getAgent(agentId);
    if (!agent) return 'no-pid';

    const candidateKeys = [
      agent.id,
      agent.sessionId,
      agent.runtimeSessionId,
      agent.resumeSessionId,
    ].filter(Boolean);
    candidateKeys.forEach((key) => sessionPids.delete(key));

    if (agent.isRegistered) {
      const registryId = agent.registryId || agent.id;
      agentRegistry?.unlinkSession?.(registryId);
      if (agent.state !== 'Offline') {
        agentManager?.transitionToOffline?.(agent.id);
      }
      debugLog(`[${label}] Focus: stale registered agent=${agent.id.slice(0, 8)} -> Offline`);
      return 'stale-session';
    }

    agentManager?.removeAgent?.(agent.id);
    debugLog(`[${label}] Focus: removed stale ephemeral agent=${agent.id.slice(0, 8)}`);
    return 'stale-session';
  }

  function resolveRegisteredResumeTarget(agent) {
    if (!agent?.isRegistered || !agentRegistry) {
      return { success: false, error: 'Agent is not resumable' };
    }

    const registryId = agent.registryId || agent.id;
    const registryAgent = agentRegistry.getAgent?.(registryId);
    if (!registryAgent) {
      return { success: false, error: 'Registered agent not found' };
    }

    const history = agentRegistry.getSessionHistory?.(registryId) || [];
    const candidateSessionIds = [
      agent.resumeSessionId,
      agent.sessionId,
      agent.runtimeSessionId,
      registryAgent.currentResumeSessionId,
      registryAgent.currentSessionId,
      registryAgent.currentRuntimeSessionId,
    ].filter(Boolean);

    let entry = null;
    for (const sessionId of candidateSessionIds) {
      entry = agentRegistry.findSessionHistoryEntry?.(registryId, sessionId) || null;
      if (entry) break;
    }

    if (!entry) {
      entry = findLatestResumableSessionEntry(history);
    }

    const transcriptPath = entry?.transcriptPath || agent.jsonlPath || null;
    const requestedResumeSessionId = entry?.resumeSessionId
      || entry?.sessionId
      || entry?.runtimeSessionId
      || agent.resumeSessionId
      || agent.sessionId
      || registryAgent.currentResumeSessionId
      || registryAgent.currentSessionId
      || registryAgent.currentRuntimeSessionId
      || null;

    const provider = registryAgent.provider || agent.provider || null;

    let cwd = resolveProjectPathForPlatform(registryAgent.workspace?.worktreePath || registryAgent.projectPath) || undefined;
    if (cwd) {
      try {
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = undefined;
      } catch {
        cwd = undefined;
      }
    }

    const resolvedSessionId = resolveResumeSessionId({
      provider,
      requestedSessionId: requestedResumeSessionId,
      transcriptPath,
      cwd,
    });
    const resumeCommand = buildResumeCommand(provider, resolvedSessionId);
    if (!resumeCommand) {
      return { success: false, error: 'Session not found' };
    }

    if (resolvedSessionId && requestedResumeSessionId && resolvedSessionId !== requestedResumeSessionId) {
      debugLog(`[Recovery] Resume fallback: ${requestedResumeSessionId.slice(0, 8)} -> ${resolvedSessionId.slice(0, 8)} (cwd: ${cwd || 'none'})`);
    }

    return {
      success: true,
      registryId,
      provider,
      cwd,
      sessionId: resolvedSessionId,
      resumeCommand,
    };
  }

  async function launchExternalResumeTerminal({ cwd, resumeCommand }) {
    const { spawn, execFile } = require('child_process');
    const trimmedResumeCommand = String(resumeCommand || '').replace(/\r/g, '').trim();
    if (!trimmedResumeCommand) {
      return { success: false, error: 'Missing resume command' };
    }

    if (process.platform === 'win32') {
      const preferredPowerShell = terminalProfileService?.resolveProfile?.('pwsh')
        || terminalProfileService?.resolveProfile?.('powershell')
        || null;
      const powerShellPath = preferredPowerShell?.command || 'powershell.exe';
      const powerShellScript = [
        cwd ? `Set-Location -LiteralPath '${String(cwd).replace(/'/g, "''")}'` : null,
        trimmedResumeCommand,
      ].filter(Boolean).join('; ');

      const child = spawn('cmd.exe', ['/c', 'start', '', powerShellPath, '-NoExit', '-Command', powerShellScript], {
        cwd: cwd || undefined,
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();
      return { success: true };
    }

    if (process.platform === 'darwin') {
      const macScript = [
        'tell application "Terminal"',
        'activate',
        `do script ${JSON.stringify(`${cwd ? `cd ${JSON.stringify(cwd)}; ` : ''}${trimmedResumeCommand}`)}`,
        'end tell',
      ].join('\n');

      await new Promise((resolve, reject) => {
        execFile('osascript', ['-e', macScript], { timeout: 5000 }, (error) => {
          if (error) reject(error);
          else resolve(null);
        });
      });
      return { success: true };
    }

    const linuxLaunchers = [
      ['x-terminal-emulator', ['-e', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}`]],
      ['gnome-terminal', ['--', 'bash', '-lc', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
      ['konsole', ['-e', 'bash', '-lc', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
      ['xfce4-terminal', ['--command', `bash -lc ${JSON.stringify(`${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`)}`]],
      ['xterm', ['-e', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
    ];

    for (const [command, args] of linuxLaunchers) {
      try {
        const child = spawn(command, args, {
          cwd: cwd || undefined,
          detached: true,
          stdio: 'ignore',
          shell: false,
        });
        child.unref();
        return { success: true };
      } catch {
        // Try the next launcher.
      }
    }

    return { success: false, error: 'No supported terminal launcher found' };
  }

  async function attemptRegisteredAgentResume(event, agentId, agent, label) {
    if (!isMainWindowSender(event)) {
      return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
    }

    const resumeTarget = resolveRegisteredResumeTarget(agent);
    if (!resumeTarget.success) {
      debugLog(`[${label}] Resume target error for agent=${agentId.slice(0, 8)}: ${resumeTarget.error}`);
      return { success: false, reason: 'resume-failed', error: resumeTarget.error };
    }

    repairStaleFocusedAgent(agentId, label);

    try {
      const launchResult = await launchExternalResumeTerminal(resumeTarget);
      if (!launchResult.success) {
        debugLog(`[${label}] External resume launch failed for agent=${agentId.slice(0, 8)}: ${launchResult.error}`);
        return { success: false, reason: 'resume-failed', error: launchResult.error || 'unknown' };
      }

      debugLog(`[${label}] External resume launched for agent=${agentId.slice(0, 8)} session=${resumeTarget.sessionId.slice(0, 8)}`);
      return { success: true, reason: 'resumed' };
    } catch (error) {
      debugLog(`[${label}] External resume error for agent=${agentId.slice(0, 8)}: ${error.message}`);
      return { success: false, reason: 'resume-failed', error: error.message };
    }
  }

  async function focusAgentTerminal(event, agentId, label) {
    const { agent, pid, candidateKeys } = resolveFocusContext(agentId);
    if (!pid) {
      if (canRecoverFocusedRegisteredAgent(agent)) {
        debugLog(`[${label}] Focus: missing PID for recoverable registered agent=${agentId.slice(0, 8)}`);
        return attemptRegisteredAgentResume(event, agentId, agent, label);
      }
      const agentAge = Date.now() - Number(agent?.firstSeen || 0);
      if (agent && agentAge >= STALE_FOCUS_REPAIR_MS) {
        return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
      }
      debugLog(`[${label}] Focus: no PID for agent=${agentId.slice(0, 8)}`);
      return { success: false, reason: 'no-pid' };
    }

    if (!isPidAlive(pid)) {
      candidateKeys.forEach((key) => sessionPids.delete(key));
      debugLog(`[${label}] Focus: dead PID for agent=${agentId.slice(0, 8)} pid=${pid}`);
      if (canRecoverFocusedRegisteredAgent(agent)) {
        return attemptRegisteredAgentResume(event, agentId, agent, label);
      }
      return { success: false, reason: repairStaleFocusedAgent(agentId, label) };
    }

    debugLog(`[${label}] Focus requested for agent=${agentId.slice(0, 8)} pid=${pid}`);
    focusTerminalByPid(pid, label, debugLog);
    return { success: true };
  }

  ipcMain.handle(electronIpcChannels.focusTerminal, async (event, agentId) => {
    return focusAgentTerminal(event, agentId, 'Main');
  });

  ipcMain.handle(electronIpcChannels.executeRecoveryAction, async () => ({ success: true }));

  ipcMain.on(dashboardIpcChannels.dashboardFocusAgent, async (event, agentId) => {
    await focusAgentTerminal(event, agentId, 'Dashboard');
  });

  return {
    focusAgentTerminal,
  };
}

module.exports = {
  registerRecoveryHandlers,
};
