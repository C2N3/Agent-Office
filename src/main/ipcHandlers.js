/**
 * IPC Handlers
 * Register all ipcMain.on/handle handlers + focusTerminalByPid
 */

const { ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseConversation, getConversationSummary } = require('./conversationParser');
const { resolveResumeSessionId } = require('./sessionIdResolver');
const { resolveProjectPathForPlatform } = require('../utils');

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

  } else if (process.platform === 'darwin') {
    // macOS: walk up parent chain to find a terminal window, then activate it
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

  } else {
    // Linux: use wmctrl if available, fall back to xdotool
    const { exec } = require('child_process');
    exec(`wmctrl -i -a $(wmctrl -lp | awk '$3 == ${pid} {print $1; exit}') 2>/dev/null || xdotool search --pid ${pid} --onlyvisible windowactivate 2>/dev/null`, { timeout: 5000 }, (err) => {
      if (err) debugLog(`[${label}] Focus error (install wmctrl or xdotool): ${err.message}`);
    });
  }
}

function buildResumeCommand(provider, sessionId) {
  if (!sessionId) return null;
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  return normalizedProvider === 'codex'
    ? `codex resume ${sessionId}\r`
    : `claude --resume ${sessionId}\r`;
}

function registerIpcHandlers({ agentManager, agentRegistry, sessionPids, windowManager, terminalManager, terminalProfileService, workspaceManager, nicknameStore, debugLog, adaptAgentToDashboard, errorHandler, attachRegisteredAgent }) {
  ipcMain.on('resize-window', (e, size) => {
    const mw = windowManager.mainWindow;
    if (!mw || mw.isDestroyed()) return;
    const { width, height, x, y } = mw.getBounds();
    const newWidth = Math.max(150, Math.ceil(size.width ? size.width + 20 : width));
    const newHeight = Math.max(180, Math.ceil(size.height ? size.height + 30 : height));
    if (newWidth === width && newHeight === height) return;
    const wa = screen.getDisplayMatching(mw.getBounds()).bounds;
    const dh = newHeight - height;
    const newY = Math.max(wa.y, Math.min(y - dh, wa.y + wa.height - newHeight));
    const newX = Math.max(wa.x, Math.min(x, wa.x + wa.width - newWidth));
    mw.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
    debugLog(`[Main] Resize → ${newWidth}x${newHeight}`);
  });

  ipcMain.on('get-avatars', (event) => {
    try {
      const charsDir = path.join(__dirname, '..', '..', 'public', 'characters');
      if (fs.existsSync(charsDir)) {
        const files = fs.readdirSync(charsDir);
        event.reply('avatars-response', files);
      } else {
        event.reply('avatars-response', []);
      }
    } catch (e) {
      errorHandler.capture(e, {
        code: 'E003',
        category: 'FILE_IO',
        severity: 'WARNING'
      });
      debugLog(`[Main] get-avatars error: ${e.message}`);
      event.reply('avatars-response', []);
    }
  });

  ipcMain.on('get-all-agents', (event) => event.reply('all-agents-response', agentManager?.getAllAgents() ?? []));

  ipcMain.handle('focus-terminal', async (event, agentId) => {
    const pid = sessionPids.get(agentId);
    if (!pid) {
      debugLog(`[Main] Focus: no PID for agent=${agentId.slice(0, 8)}`);
      return { success: false, reason: 'no-pid' };
    }
    debugLog(`[Main] Focus requested for agent=${agentId.slice(0, 8)} pid=${pid}`);
    focusTerminalByPid(pid, 'Main', debugLog);
    return { success: true };
  });

  // Dashboard IPC Handlers
  ipcMain.handle('open-web-dashboard', async (event) => {
    try {
      const result = windowManager.createDashboardWindow();
      return result;
    } catch (error) {
      debugLog(`[MissionControl] Error opening dashboard: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('execute-recovery-action', async () => ({ success: true }));

  ipcMain.on('dashboard-focus-agent', (event, agentId) => {
    const pid = sessionPids.get(agentId);
    if (!pid) {
      debugLog(`[Dashboard] Focus: no PID for agent=${agentId.slice(0, 8)}`);
      return;
    }
    debugLog(`[Dashboard] Focus requested for agent=${agentId.slice(0, 8)} pid=${pid}`);
    focusTerminalByPid(pid, 'Dashboard', debugLog);
  });

  ipcMain.on('get-dashboard-agents', (event) => {
    if (agentManager) {
      const agents = agentManager.getAllAgents();
      const adaptedAgents = agents.map(agent => adaptAgentToDashboard(agent));
      event.reply('dashboard-agents-response', adaptedAgents);
    } else {
      event.reply('dashboard-agents-response', []);
    }
  });

  ipcMain.handle('agents:clear-inactive-unregistered', async () => {
    if (!agentManager) return { success: false, clearedCount: 0, clearedIds: [] };

    const removableAgents = agentManager.getAllAgents().filter((agent) => {
      if (!agent || agent.isRegistered) return false;
      return agent.state === 'Done' || agent.state === 'Offline';
    });

    const clearedIds = [];
    for (const agent of removableAgents) {
      if (agentManager.removeAgent(agent.id)) {
        clearedIds.push(agent.id);
      }
    }

    return {
      success: true,
      clearedCount: clearedIds.length,
      clearedIds,
    };
  });

  // ─── PiP ───
  ipcMain.handle('toggle-pip', async () => {
    try {
      const pw = windowManager.pipWindow;
      if (pw && !pw.isDestroyed()) {
        windowManager.closePipWindow();
        return { success: true, action: 'closed' };
      } else {
        windowManager.createPipWindow();
        return { success: true, action: 'opened' };
      }
    } catch (error) {
      debugLog(`[PiP] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('pip-close', () => {
    windowManager.closePipWindow();
  });

  ipcMain.on('pip-back-to-dashboard', () => {
    windowManager.closePipWindow();
    windowManager.focusDashboardWindow();
  });

  // ─── Nickname ───
  if (nicknameStore) {
    ipcMain.handle('nickname:set', async (event, agentId, nickname) => {
      const result = nicknameStore.setNickname(agentId, nickname);
      // Re-trigger agent update so displayName refreshes everywhere
      const agent = agentManager?.getAgent(agentId);
      if (agent) {
        agentManager.updateAgent({ sessionId: agentId, state: agent.state }, 'nickname');
      }
      return { success: true, nickname: result };
    });

    ipcMain.handle('nickname:get', async (event, agentId) => {
      return { nickname: nicknameStore.getNickname(agentId) };
    });

    ipcMain.handle('nickname:remove', async (event, agentId) => {
      nicknameStore.removeNickname(agentId);
      const agent = agentManager?.getAgent(agentId);
      if (agent) {
        agentManager.updateAgent({ sessionId: agentId, state: agent.state }, 'nickname');
      }
      return { success: true };
    });
  }

  // ─── Terminal ───
  if (terminalManager) {
    if (terminalProfileService) {
      ipcMain.handle('terminal:profiles', async () => {
        return terminalProfileService.getProfilesWithDefault();
      });

      ipcMain.handle('terminal:default-profile:set', async (event, profileId) => {
        try {
          return {
            success: true,
            ...terminalProfileService.setDefaultProfile(profileId),
          };
        } catch (e) {
          debugLog(`[Terminal] Default profile error: ${e.message}`);
          return { success: false, error: e.message };
        }
      });
    }

    ipcMain.handle('terminal:create', async (event, agentId, options) => {
      try {
        const result = terminalManager.createTerminal(agentId, options);
        return result;
      } catch (e) {
        debugLog(`[Terminal] Create error: ${e.message}`);
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('terminal:write', async (event, agentId, data) => {
      terminalManager.writeToTerminal(agentId, data);
    });

    ipcMain.handle('terminal:resize', async (event, agentId, cols, rows) => {
      terminalManager.resizeTerminal(agentId, cols, rows);
    });

    ipcMain.handle('terminal:destroy', async (event, agentId) => {
      terminalManager.destroyTerminal(agentId);
      return { success: true };
    });

    // Open a visible PowerShell window so the user can confirm the execution policy change
    ipcMain.handle('powershell:open-policy-terminal', async () => {
      if (process.platform !== 'win32') return { success: false };
      const { spawn } = require('child_process');
      const cmd = 'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; Write-Host "완료! 이 창을 닫아도 됩니다." -ForegroundColor Green';
      spawn('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit', '-Command', cmd], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      }).unref();
      return { success: true };
    });
  }

  // ─── Agent Registry ───
  if (agentRegistry) {
    ipcMain.handle('registry:create', async (event, data) => {
      const agent = agentRegistry.createAgent(data);
      const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(agent) : null;
      // Create Offline entry in agentManager so it shows immediately
      if (!attachedSessionId) {
        agentManager.updateAgent({
          registryId: agent.id,
          displayName: agent.name,
          role: agent.role,
          projectPath: agent.projectPath,
          avatarIndex: agent.avatarIndex,
          provider: agent.provider,
          workspace: agent.workspace || null,
          isRegistered: true,
          state: 'Offline',
        }, 'registry');
      }
      return { success: true, agent };
    });

    ipcMain.handle('registry:list', async () => {
      return agentRegistry.getAllAgents();
    });

    ipcMain.handle('registry:update', async (event, registryId, fields) => {
      const updated = agentRegistry.updateAgent(registryId, fields);
      if (updated) {
        const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(updated) : null;
        const existing = agentManager.getAgent(registryId);
        if (existing) {
          agentManager.updateAgent({
            ...existing,
            registryId,
            displayName: updated.name,
            role: updated.role,
            projectPath: updated.projectPath,
            avatarIndex: updated.avatarIndex,
            workspace: updated.workspace || null,
          }, 'registry');
        } else if (!attachedSessionId) {
          agentManager.updateAgent({
            registryId,
            displayName: updated.name,
            role: updated.role,
            projectPath: updated.projectPath,
            avatarIndex: updated.avatarIndex,
            provider: updated.provider,
            workspace: updated.workspace || null,
            isRegistered: true,
            state: 'Offline',
          }, 'registry');
        }
      }
      return { success: !!updated, agent: updated };
    });

    if (workspaceManager) {
      ipcMain.handle('workspace:inspect-repo', async (event, repoPath) => {
        try {
          return { success: true, repository: workspaceManager.inspectRepository(repoPath) };
        } catch (error) {
          debugLog(`[Workspace] Inspect error: ${error.message}`);
          return { success: false, error: error.message };
        }
      });

      ipcMain.handle('workspace:create', async (event, data) => {
        try {
          const workspaceResult = workspaceManager.createWorkspace(data);
          const agent = agentRegistry.createAgent({
            name: data.name,
            role: data.role,
            projectPath: workspaceResult.workspacePath,
            provider: data.provider,
            workspace: workspaceResult.workspace,
          });

          const attachedSessionId = attachRegisteredAgent ? attachRegisteredAgent(agent) : null;
          if (!attachedSessionId) {
            agentManager.updateAgent({
              registryId: agent.id,
              displayName: agent.name,
              role: agent.role,
              projectPath: agent.projectPath,
              avatarIndex: agent.avatarIndex,
              provider: agent.provider,
              workspace: agent.workspace || null,
              isRegistered: true,
              state: 'Offline',
            }, 'workspace');
          }

          return {
            success: true,
            agent,
            workspace: workspaceResult.workspace,
            bootstrapCommand: workspaceResult.bootstrapCommand,
          };
        } catch (error) {
          debugLog(`[Workspace] Create error: ${error.message}`);
          return { success: false, error: error.message };
        }
      });

      ipcMain.handle('workspace:merge-cleanup', async (event, registryId) => {
        try {
          const agent = agentRegistry.getAgent(registryId);
          if (!agent) return { success: false, error: 'Agent not found' };
          if (agent.currentSessionId) return { success: false, error: 'Stop the active session before merging this workspace.' };
          if (!agent.workspace) return { success: false, error: 'No managed workspace is attached to this agent.' };

          const result = workspaceManager.mergeWorkspace(agent.workspace);
          agentRegistry.archiveAgent(registryId);
          const existing = agentManager.getAgent(registryId);
          if (existing && existing.state === 'Offline') {
            agentManager.removeAgent(registryId);
          }

          return { success: true, result };
        } catch (error) {
          debugLog(`[Workspace] Merge cleanup error: ${error.message}`);
          return { success: false, error: error.message };
        }
      });

      ipcMain.handle('workspace:remove', async (event, registryId) => {
        try {
          const agent = agentRegistry.getAgent(registryId);
          if (!agent) return { success: false, error: 'Agent not found' };
          if (agent.currentSessionId) return { success: false, error: 'Stop the active session before removing this workspace.' };
          if (!agent.workspace) return { success: false, error: 'No managed workspace is attached to this agent.' };

          const result = workspaceManager.removeWorkspace(agent.workspace, { deleteBranch: true });
          agentRegistry.archiveAgent(registryId);
          const existing = agentManager.getAgent(registryId);
          if (existing && existing.state === 'Offline') {
            agentManager.removeAgent(registryId);
          }

          return { success: true, result };
        } catch (error) {
          debugLog(`[Workspace] Remove error: ${error.message}`);
          return { success: false, error: error.message };
        }
      });
    }

    ipcMain.handle('registry:list-archived-workspaces', async () => {
      return agentRegistry.getArchivedWorkspaceAgents();
    });

    ipcMain.handle('registry:list-archived', async () => {
      return agentRegistry.getArchivedAgents();
    });

    ipcMain.handle('registry:toggle', async (event, registryId, enabled) => {
      agentRegistry.setEnabled(registryId, enabled);
      return { success: true };
    });

    ipcMain.handle('registry:archive', async (event, registryId) => {
      const result = agentRegistry.archiveAgent(registryId);
      if (result) {
        const existing = agentManager.getAgent(registryId);
        if (existing && existing.state === 'Offline') {
          agentManager.removeAgent(registryId);
        }
      }
      return { success: result };
    });

    ipcMain.handle('registry:delete', async (event, registryId) => {
      const result = agentRegistry.deleteAgent(registryId);
      if (result) {
        agentManager.removeAgent(registryId);
      }
      return { success: result };
    });

    ipcMain.handle('registry:session-history', async (event, registryId) => {
      const history = agentRegistry.getSessionHistory(registryId);
      return history.map(entry => {
        const summary = entry.transcriptPath
          ? getConversationSummary(entry.transcriptPath)
          : null;
        return { ...entry, summary };
      });
    });

    ipcMain.handle('registry:conversation', async (event, registryId, sessionId, options) => {
      const entry = agentRegistry.findSessionHistoryEntry(registryId, sessionId);

      let transcriptPath = entry ? entry.transcriptPath : null;
      if (!transcriptPath) {
        const agent = agentManager?.getAgent(registryId);
        if (agent && (agent.sessionId === sessionId || agent.runtimeSessionId === sessionId || agent.resumeSessionId === sessionId) && agent.jsonlPath) {
          transcriptPath = agent.jsonlPath;
        }
      }

      if (!transcriptPath) return { error: 'Transcript not found' };
      const result = parseConversation(transcriptPath, options || {});
      if (!result) return { error: 'Could not parse transcript' };
      return result;
    });

    ipcMain.handle('registry:resume-session', async (event, registryId, sessionId) => {
      if (!terminalManager) return { success: false, error: 'Terminal not available' };

      const agent = agentRegistry.getAgent(registryId);
      if (!agent) return { success: false, error: 'Agent not found' };
      const entry = agentRegistry.findSessionHistoryEntry(registryId, sessionId);

      let transcriptPath = entry?.transcriptPath || null;
      if (!transcriptPath) {
        const liveAgent = agentManager?.getAgent(registryId);
        if (liveAgent && (liveAgent.sessionId === sessionId || liveAgent.runtimeSessionId === sessionId || liveAgent.resumeSessionId === sessionId) && liveAgent.jsonlPath) {
          transcriptPath = liveAgent.jsonlPath;
        }
      }

      const requestedResumeSessionId = entry?.resumeSessionId || sessionId;

      const resolvedSessionId = resolveResumeSessionId({
        provider: agent.provider,
        requestedSessionId: requestedResumeSessionId,
        transcriptPath,
      });

      const resumeCommand = buildResumeCommand(agent.provider, resolvedSessionId);
      if (!resumeCommand) return { success: false, error: 'Session not found' };

      // Use the agent's own ID — destroy existing terminal first
      if (terminalManager.hasTerminal(registryId)) {
        terminalManager.destroyTerminal(registryId);
      }

      // Validate cwd exists, fall back to home dir
      let cwd = resolveProjectPathForPlatform(agent.workspace?.worktreePath || agent.projectPath) || undefined;
      if (cwd) {
        try {
          if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = undefined;
        } catch { cwd = undefined; }
      }

      const result = terminalManager.createTerminal(registryId, { cwd });
      if (!result.success) return result;

      setTimeout(() => {
        terminalManager.writeToTerminal(registryId, resumeCommand);
      }, 800);

      return { ...result, terminalId: registryId, sessionId: resolvedSessionId };
    });
  }
}

module.exports = { registerIpcHandlers };
