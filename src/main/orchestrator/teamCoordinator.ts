/**
 * TeamCoordinator — fully independent team execution pipeline.
 * Does NOT use Orchestrator's task queue, idle timers, or session handling.
 * Spawns CLI in --print mode via processManager (headless, no PTY/ConPTY).
 */
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cleanTerminalOutput } = require('./cleanOutput');

const TEAM_OUTPUT_DIR = path.join(os.homedir(), '.agent-office', 'team-output');
const GLOBAL_WORKTREE_DIR = path.join(os.homedir(), '.agent-office', 'worktrees');

class TeamCoordinator extends EventEmitter {
  constructor({ teamStore, terminalManager, processManager, agentRegistry, agentManager, workspaceManager, debugLog }) {
    super();
    this.teamStore = teamStore;
    this.terminalManager = terminalManager;
    this.processManager = processManager;
    this.agentRegistry = agentRegistry;
    this.agentManager = agentManager;
    this.workspaceManager = workspaceManager;
    this.debugLog = debugLog || (() => {});
    this.activeJobs = new Map(); // teamId:agentId -> { jobId }
  }

  // ========== PUBLIC API ==========

  createTeam(input) {
    const team = this.teamStore.createTeam(input);
    const shortId = team.id.slice(0, 8);

    let baseBranch = team.baseBranch;
    try {
      const repoRoot = this.workspaceManager.resolveRepositoryRoot(team.repositoryPath);
      baseBranch = this.workspaceManager.resolveBaseBranch(repoRoot, team.baseBranch);
    } catch {}

    this.teamStore.updateTeam(team.id, {
      integrationBranch: `team/${shortId}`,
      baseBranch,
    });

    this.debugLog(`[Team] Created "${team.name}" (${shortId})`);
    this.emit('team:created', this.teamStore.getTeam(team.id));

    // Set all members to Working state
    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({
        registryId: memberId,
        teamId: team.id,
        teamName: team.name,
      }, 'team');
    }

    // Start planning phase
    this._runPlanningTask(team.id);
    return this.teamStore.getTeam(team.id);
  }

  cancelTeam(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) throw new Error('Team not found');

    // Kill all active processes
    for (const [key, job] of this.activeJobs) {
      if (key.startsWith(teamId)) {
        if (this.processManager?.isRunning(job.jobId)) {
          this.processManager.kill(job.jobId).catch(() => {});
        }
      }
    }

    // Clean worktrees
    this._cleanupTeamWorktrees(team);

    // Reset members
    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({ registryId: memberId, state: 'Offline', teamId: null, teamName: null }, 'team');
    }

    this.teamStore.updateTeam(teamId, { status: 'cancelled', completedAt: Date.now() });
    this.emit('team:cancelled', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
    return this.teamStore.getTeam(teamId);
  }

  // ========== PLANNING PHASE ==========

  _runPlanningTask(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    const memberDescriptions = team.memberAgentIds
      .map((id) => { const a = this.agentRegistry.getAgent(id); return a ? `- ${a.name} (${a.role || 'general'})` : null; })
      .filter(Boolean).join('\n');

    const prompt = `You are the team leader. Your team's goal:\n${team.goal}\n\nYour team members:\n${memberDescriptions}\n\nBreak this goal into concrete subtasks for each team member. Output exactly one JSON block:\n\`\`\`json\n{"subtasks":[{"assignee":"member name","title":"short title","prompt":"detailed instructions","dependsOn":[]}]}\n\`\`\`\n\nRules:\n- Assign each subtask to a specific team member by their exact name.\n- Use "dependsOn" to list titles of subtasks that must complete first.\n- Keep prompts specific and actionable.`;

    this.teamStore.updateTeam(teamId, { status: 'planning' });
    this.emit('team:updated', this.teamStore.getTeam(teamId));

    this.agentManager.updateAgent({
      registryId: team.leaderAgentId,
      state: 'Working',
      teamId: team.id,
    }, 'team');

    this._runCLI({
      teamId,
      agentId: team.leaderAgentId,
      prompt,
      repoPath: team.repositoryPath,
      label: `[Team Plan] ${team.name}`,
      onSuccess: (output) => this._onPlanningDone(teamId, output),
      onFailure: (err) => {
        this.debugLog(`[Team] Planning failed: ${err}`);
        this._failTeam(teamId, `Planning failed: ${err}`);
      },
    });
  }

  _onPlanningDone(teamId, output) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    const subtasks = this._parseSubtasks(output);
    this.debugLog(`[Team] Parsed subtasks: ${subtasks ? subtasks.length : 'null'}`);

    if (!subtasks || subtasks.length === 0) {
      this._failTeam(teamId, 'Could not parse subtask plan from leader output.');
      return;
    }

    // Set leader to Waiting (done planning, waiting for members)
    this.agentManager.updateAgent({ registryId: team.leaderAgentId, state: 'Waiting' }, 'team');

    // Resolve assignees
    const memberMap = new Map();
    for (const memberId of team.memberAgentIds) {
      const agent = this.agentRegistry.getAgent(memberId);
      if (agent) memberMap.set(agent.name.toLowerCase(), memberId);
    }

    // Build ordered subtask list respecting dependsOn
    const subtaskEntries = subtasks.map((sub) => {
      const assigneeId = memberMap.get(sub.assignee?.toLowerCase())
        || team.memberAgentIds.find((id) => {
          const a = this.agentRegistry.getAgent(id);
          return a && a.name.toLowerCase().includes(sub.assignee?.toLowerCase());
        })
        || team.leaderAgentId;
      return { ...sub, assigneeId };
    });

    this.teamStore.updateTeam(teamId, { status: 'working', subtaskEntries });
    this.emit('team:working', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));

    this.debugLog(`[Team] Distributing ${subtaskEntries.length} subtask(s)`);
    this._dispatchSubtasks(teamId);
  }

  // ========== SUBTASK EXECUTION ==========

  _dispatchSubtasks(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team || team.status !== 'working') return;

    const entries = team.subtaskEntries || [];
    const completed = team.completedSubtasks || [];
    const running = team.runningSubtasks || [];

    for (const sub of entries) {
      if (completed.includes(sub.title) || running.includes(sub.title)) continue;

      // Check dependsOn
      const depsOk = (sub.dependsOn || []).every(dep => completed.includes(dep));
      if (!depsOk) continue;

      // Dispatch this subtask
      this.teamStore.updateTeam(teamId, {
        runningSubtasks: [...(this.teamStore.getTeam(teamId).runningSubtasks || []), sub.title],
      });

      this.agentManager.updateAgent({
        registryId: sub.assigneeId,
        state: 'Working',
        teamId: team.id,
      }, 'team');

      const agent = this.agentRegistry.getAgent(sub.assigneeId);
      this.debugLog(`[Team] Dispatching "${sub.title}" → ${agent?.name || sub.assigneeId.slice(0, 8)}`);

      this._runCLI({
        teamId,
        agentId: sub.assigneeId,
        prompt: sub.prompt,
        repoPath: team.repositoryPath,
        label: `[Team] ${sub.title}`,
        onSuccess: (output) => this._onSubtaskDone(teamId, sub.title, output),
        onFailure: (err) => {
          this.debugLog(`[Team] Subtask "${sub.title}" failed: ${err}`);
          this._failTeam(teamId, `Subtask "${sub.title}" failed: ${err}`);
        },
      });
    }
  }

  _onSubtaskDone(teamId, title, output) {
    const team = this.teamStore.getTeam(teamId);
    if (!team || team.status !== 'working') return;

    const completed = [...(team.completedSubtasks || []), title];
    const running = (team.runningSubtasks || []).filter(t => t !== title);
    this.teamStore.updateTeam(teamId, { completedSubtasks: completed, runningSubtasks: running });

    const entries = team.subtaskEntries || [];
    const allDone = entries.every(e => completed.includes(e.title));

    this.debugLog(`[Team] Subtask "${title}" done (${completed.length}/${entries.length})`);

    if (allDone) {
      this._onAllSubtasksDone(teamId);
    } else {
      // Dispatch next subtasks whose deps are now met
      this._dispatchSubtasks(teamId);
    }
  }

  _onAllSubtasksDone(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    this.debugLog(`[Team] All subtasks complete for ${teamId.slice(0, 8)}`);
    this.teamStore.updateTeam(teamId, { status: 'completed', completedAt: Date.now() });

    // Leader gets report bubble
    this.agentManager.updateAgent({
      registryId: team.leaderAgentId,
      state: 'done',
      reportTeamId: team.id,
    }, 'team');

    // Members go to Waiting (until team report is handled)
    for (const memberId of team.memberAgentIds) {
      if (memberId !== team.leaderAgentId) {
        this.agentManager.updateAgent({ registryId: memberId, state: 'Waiting' }, 'team');
      }
    }

    this.emit('team:completed', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
  }

  // ========== CLI RUNNER (headless spawn via processManager) ==========

  _runCLI({ teamId, agentId, prompt, repoPath, label, onSuccess, onFailure }) {
    const jobId = `team-${teamId.slice(0, 8)}-${agentId.slice(0, 8)}-${Date.now()}`;
    const agent = this.agentRegistry.getAgent(agentId);
    const provider = agent?.provider || 'claude';

    // Build headless command — prompt delivered via stdin pipe
    let command, args;
    if (provider === 'claude') {
      command = 'claude';
      args = ['--print', '--verbose', '--dangerously-skip-permissions', '--max-turns', '50', '--output-format', 'stream-json'];
    } else if (provider === 'codex') {
      command = 'codex';
      args = ['exec', '--full-auto'];
    } else {
      command = 'gemini';
      args = ['--yolo', '--prompt='];
    }

    // Create worktree for this task
    let cwd = repoPath;
    try {
      const repoRoot = this.workspaceManager.resolveRepositoryRoot(repoPath);
      const repoName = path.basename(repoRoot);
      const branchName = `team/${teamId.slice(0, 8)}/${agentId.slice(0, 8)}`;
      const team = this.teamStore.getTeam(teamId);
      const wsParent = path.join(GLOBAL_WORKTREE_DIR, repoName);
      const wsPath = path.join(wsParent, branchName.replace(/\//g, '-'));

      if (!fs.existsSync(wsPath)) {
        const result = this.workspaceManager.createWorkspace({
          name: branchName,
          repoPath: repoRoot,
          branchName,
          baseBranch: team?.baseBranch || 'HEAD',
          workspaceParent: wsParent,
        });
        cwd = result.workspacePath;
      } else {
        cwd = wsPath;
      }
    } catch (e) {
      this.debugLog(`[Team] Worktree creation failed, using repo directly: ${e.message}`);
    }

    // Spawn headless process via processManager
    this.processManager.spawn(jobId, { command, args, cwd })
      .then(({ stdout, stderr, stdin, exitPromise }) => {
        // Deliver prompt via stdin pipe
        stdin.write(prompt + '\n');
        stdin.end();

        // Collect output
        let output = '';
        stdout.setEncoding('utf8');
        stdout.on('data', (chunk) => { output += chunk; });
        stderr.setEncoding('utf8');
        stderr.on('data', (chunk) => { output += chunk; });

        this.activeJobs.set(`${teamId}:${agentId}`, { jobId });
        this.debugLog(`[Team] CLI started: ${label} (${jobId.slice(0, 16)})`);

        exitPromise.then((exitCode) => {
          this.activeJobs.delete(`${teamId}:${agentId}`);

          // Clean output and save
          const clean = cleanTerminalOutput(output);
          try {
            fs.mkdirSync(TEAM_OUTPUT_DIR, { recursive: true });
            fs.writeFileSync(path.join(TEAM_OUTPUT_DIR, `${jobId}.txt`), clean, 'utf-8');
          } catch {}

          if (exitCode === 0) {
            this.debugLog(`[Team] CLI done (${label}): exit 0, ${clean.length} chars`);
            onSuccess(clean);
          } else {
            onFailure(`CLI exited with code ${exitCode}`);
          }
        });
      })
      .catch((err) => {
        onFailure(`Spawn failed: ${err.message}`);
      });
  }

  // ========== HELPERS ==========

  _failTeam(teamId, errorMessage) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    // Kill active jobs
    for (const [key, job] of this.activeJobs) {
      if (key.startsWith(teamId)) {
        if (this.processManager?.isRunning(job.jobId)) {
          this.processManager.kill(job.jobId).catch(() => {});
        }
        this.activeJobs.delete(key);
      }
    }

    this._cleanupTeamWorktrees(team);

    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({ registryId: memberId, state: 'Offline', teamId: null, teamName: null }, 'team');
    }

    this.teamStore.updateTeam(teamId, { status: 'failed', errorMessage, completedAt: Date.now() });
    this.emit('team:failed', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
    this.debugLog(`[Team] Failed: ${teamId.slice(0, 8)} — ${errorMessage}`);
  }

  _cleanupTeamWorktrees(team) {
    if (!team) return;
    try {
      const repoRoot = this.workspaceManager.resolveRepositoryRoot(team.repositoryPath);
      const prefix = `team/${team.id.slice(0, 8)}/`;
      // List and remove worktree branches
      const branches = this.workspaceManager.listLocalBranches(repoRoot);
      for (const branch of branches) {
        if (branch.startsWith(prefix)) {
          try { this.workspaceManager.runGit(repoRoot, ['worktree', 'remove', '--force', branch]); } catch {}
          try { this.workspaceManager.runGit(repoRoot, ['branch', '-D', branch]); } catch {}
        }
      }
    } catch (e) {
      this.debugLog(`[Team] Worktree cleanup error: ${e.message}`);
    }
  }

  _parseSubtasks(output) {
    if (!output) return null;

    // Strategy 1: ```json ... ``` code block
    const codeBlockPatterns = [/```json\s*\n([\s\S]*?)\n\s*```/g, /```\s*\n([\s\S]*?)\n\s*```/g];
    for (const pattern of codeBlockPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const result = this._tryParse(match[1]);
        if (result && result.length > 1) return result;
      }
    }

    // Strategy 2: {"subtasks": [...]}
    const objMatch = output.match(/\{[\s\S]*?"subtasks"\s*:\s*\[[\s\S]*?\]\s*\}/g);
    if (objMatch) {
      for (const candidate of objMatch) {
        const result = this._tryParse(candidate);
        if (result && result.length > 1 && !result[0]?.assignee?.includes('member name')) return result;
      }
    }

    // Strategy 3: individual field scanning
    const pat = /"assignee"\s*:\s*"([^"]+)"[\s\S]*?"title"\s*:\s*"([^"]+)"[\s\S]*?"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const found = [];
    let m;
    while ((m = pat.exec(output)) !== null) {
      if (m[1].includes('member name')) continue;
      found.push({ assignee: m[1], title: m[2], prompt: m[3].replace(/\\n/g, '\n').replace(/\\"/g, '"'), dependsOn: [] });
    }
    if (found.length > 0) return found;
    return null;
  }

  _tryParse(text) {
    try {
      const p = JSON.parse(text);
      if (Array.isArray(p)) return p;
      if (p.subtasks && Array.isArray(p.subtasks)) return p.subtasks;
    } catch {}
    return null;
  }
}

module.exports = { TeamCoordinator };
