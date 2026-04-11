// @ts-nocheck
const EventEmitter = require('events');

class TeamCoordinator extends EventEmitter {
  constructor({ teamStore, orchestrator, agentRegistry, agentManager, workspaceManager, debugLog }) {
    super();
    this.teamStore = teamStore;
    this.orchestrator = orchestrator;
    this.agentRegistry = agentRegistry;
    this.agentManager = agentManager;
    this.workspaceManager = workspaceManager;
    this.debugLog = debugLog || (() => {});

    // Listen for task completions
    if (orchestrator) {
      orchestrator.on('task:succeeded', (task) => this._onTaskSucceeded(task));
      orchestrator.on('task:failed', (task) => this._onTaskFailed(task));
    }
  }

  /**
   * Create a team and submit the planning task to the leader.
   */
  createTeam(input) {
    const team = this.teamStore.createTeam(input);
    const shortId = team.id.slice(0, 8);
    const integrationBranch = `team/${shortId}`;

    // Detect the actual base branch from the repository
    let baseBranch = team.baseBranch;
    try {
      const repoRoot = this.workspaceManager.resolveRepositoryRoot(team.repositoryPath);
      baseBranch = this.workspaceManager.getCurrentBranch(repoRoot) || 'HEAD';
      this.debugLog(`[Team] Detected base branch: ${baseBranch}`);
    } catch (e) {
      this.debugLog(`[Team] Could not detect base branch: ${e.message}`);
    }

    this.teamStore.updateTeam(team.id, { integrationBranch, baseBranch });

    // Submit planning task to the leader
    const memberDescriptions = team.memberAgentIds
      .map((id) => {
        const agent = this.agentRegistry.getAgent(id);
        return agent ? `- ${agent.name} (${agent.role || 'general'})` : null;
      })
      .filter(Boolean)
      .join('\n');

    const planningPrompt = `You are the team leader. Your team's goal:
${team.goal}

Your team members:
${memberDescriptions}

Break this goal into concrete subtasks for each team member. Output exactly one JSON block:
\`\`\`json
{
  "subtasks": [
    {
      "assignee": "member name (exact match)",
      "title": "short task title",
      "prompt": "detailed instructions for this subtask",
      "dependsOn": []
    }
  ]
}
\`\`\`

Rules:
- Assign each subtask to a specific team member by their exact name.
- Use "dependsOn" to list titles of subtasks that must complete first.
- You may assign multiple subtasks to one member.
- Keep prompts specific and actionable.`;

    const leaderAgent = this.agentRegistry.getAgent(team.leaderAgentId);
    const task = this.orchestrator.submitTask({
      title: `[Team Plan] ${team.name}: ${team.goal.slice(0, 40)}`,
      prompt: planningPrompt,
      provider: leaderAgent?.provider || 'claude',
      repositoryPath: team.repositoryPath,
      agentRegistryId: team.leaderAgentId,
      priority: 'high',
    });

    this.teamStore.updateTeam(team.id, {
      planningTaskId: task.id,
      status: 'planning',
    });

    this.emit('team:created', this.teamStore.getTeam(team.id));
    this.emit('team:updated', this.teamStore.getTeam(team.id));
    this.debugLog(`[Team] Created team "${team.name}" (${shortId}), planning task: ${task.id.slice(0, 8)}`);

    return this.teamStore.getTeam(team.id);
  }

  /**
   * Handle task success — check if it's a planning or subtask completion.
   */
  _onTaskSucceeded(task) {
    this.debugLog(`[Team] _onTaskSucceeded: ${task.id.slice(0, 8)}`);
    const teams = this.teamStore.getAllTeams();
    for (const team of teams) {
      if (team.planningTaskId === task.id && team.status === 'planning') {
        this.debugLog(`[Team] Matched planning task for team ${team.id.slice(0, 8)}`);
        this._handlePlanningComplete(team.id, task);
        return;
      }
      if (team.subtaskIds.includes(task.id) && team.status === 'working') {
        this._checkTeamCompletion(team.id);
        return;
      }
    }
    this.debugLog(`[Team] Task ${task.id.slice(0, 8)} did not match any team`);
  }

  /**
   * Handle task failure — check if it affects a team.
   */
  _onTaskFailed(task) {
    const teams = this.teamStore.getAllTeams();
    for (const team of teams) {
      if (team.planningTaskId === task.id && team.status === 'planning') {
        this.teamStore.updateTeam(team.id, {
          status: 'failed',
          errorMessage: 'Planning task failed: ' + (task.errorMessage || 'unknown'),
          completedAt: Date.now(),
        });
        this.emit('team:failed', this.teamStore.getTeam(team.id));
        this.emit('team:updated', this.teamStore.getTeam(team.id));
        this.debugLog(`[Team] Planning failed for ${team.id.slice(0, 8)}`);
        return;
      }
      if (team.subtaskIds.includes(task.id) && team.status === 'working') {
        this.teamStore.updateTeam(team.id, {
          status: 'failed',
          errorMessage: `Subtask "${task.title}" failed: ${task.errorMessage || 'unknown'}`,
          completedAt: Date.now(),
        });
        this.emit('team:failed', this.teamStore.getTeam(team.id));
        this.emit('team:updated', this.teamStore.getTeam(team.id));
        this.debugLog(`[Team] Subtask failed for ${team.id.slice(0, 8)}: ${task.id.slice(0, 8)}`);
        return;
      }
    }
  }

  /**
   * Parse the leader's planning output and create subtasks.
   */
  _handlePlanningComplete(teamId, planningTask) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    // Read saved output
    let output = planningTask.lastOutput || '';
    if (planningTask.outputPath) {
      try {
        const fs = require('fs');
        output = fs.readFileSync(planningTask.outputPath, 'utf-8');
        this.debugLog(`[Team] Read output from file (${output.length} chars)`);
      } catch (e) {
        this.debugLog(`[Team] Failed to read output file: ${e.message}`);
      }
    }
    this.debugLog(`[Team] Output length: ${output.length}, first 200: ${output.slice(0, 200).replace(/\n/g, '\\n')}`);

    // Parse JSON subtasks from output
    const subtasks = this._parseSubtasks(output);
    this.debugLog(`[Team] Parsed subtasks: ${subtasks ? subtasks.length : 'null'}`);
    if (!subtasks || subtasks.length === 0) {
      this.teamStore.updateTeam(teamId, {
        status: 'failed',
        errorMessage: 'Could not parse subtask plan from leader output.',
        completedAt: Date.now(),
      });
      this.emit('team:failed', this.teamStore.getTeam(teamId));
      this.emit('team:updated', this.teamStore.getTeam(teamId));
      this.debugLog(`[Team] Failed to parse subtasks for ${teamId.slice(0, 8)}`);
      return;
    }

    // Resolve assignees to agent IDs
    const memberMap = new Map();
    for (const memberId of team.memberAgentIds) {
      const agent = this.agentRegistry.getAgent(memberId);
      if (agent) memberMap.set(agent.name.toLowerCase(), memberId);
    }

    // Create subtasks with dependency resolution
    const titleToTaskId = new Map();
    const subtaskIds = [];

    for (const sub of subtasks) {
      const assigneeId = memberMap.get(sub.assignee?.toLowerCase())
        || team.memberAgentIds.find((id) => {
          const a = this.agentRegistry.getAgent(id);
          return a && a.name.toLowerCase().includes(sub.assignee?.toLowerCase());
        })
        || team.leaderAgentId; // fallback to leader

      const dependsOn = (sub.dependsOn || [])
        .map((title) => titleToTaskId.get(title.toLowerCase()))
        .filter(Boolean);

      const assigneeAgent = this.agentRegistry.getAgent(assigneeId);
      const task = this.orchestrator.submitTask({
        title: `[Team] ${sub.title}`,
        prompt: sub.prompt,
        provider: assigneeAgent?.provider || 'claude',
        repositoryPath: team.repositoryPath,
        baseBranch: team.baseBranch,
        agentRegistryId: assigneeId,
        parentTaskId: team.planningTaskId,
        dependsOn,
        priority: 'normal',
      });

      titleToTaskId.set(sub.title.toLowerCase(), task.id);
      subtaskIds.push(task.id);
      this.debugLog(`[Team] Subtask "${sub.title}" → ${assigneeAgent?.name || assigneeId.slice(0, 8)}`);
    }

    this.teamStore.updateTeam(teamId, {
      subtaskIds,
      status: 'working',
    });

    // Update member agents to show team membership
    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({
        registryId: memberId,
        teamId: team.id,
        teamName: team.name,
      }, 'team');
    }

    this.emit('team:working', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
    this.debugLog(`[Team] Distributed ${subtasks.length} subtask(s) for ${teamId.slice(0, 8)}`);
  }

  /**
   * Check if all subtasks are complete and trigger merge.
   */
  _checkTeamCompletion(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team || team.status !== 'working') return;

    const allDone = team.subtaskIds.every((id) => {
      const task = this.orchestrator.getTask(id);
      return task && task.status === 'succeeded';
    });

    if (!allDone) return;

    this.teamStore.updateTeam(teamId, { status: 'merging' });
    this.debugLog(`[Team] All subtasks complete for ${teamId.slice(0, 8)}, merging...`);

    this._mergeTeamResults(teamId);
  }

  /**
   * Merge all subtask branches into the integration branch.
   */
  _mergeTeamResults(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) return;

    let repoRoot;
    try {
      repoRoot = this.workspaceManager.resolveRepositoryRoot(team.repositoryPath);
    } catch (e) {
      this.teamStore.updateTeam(teamId, {
        status: 'failed',
        errorMessage: `Cannot resolve repo: ${e.message}`,
        completedAt: Date.now(),
      });
      this.emit('team:failed', this.teamStore.getTeam(teamId));
      this.emit('team:updated', this.teamStore.getTeam(teamId));
      return;
    }

    // Create integration branch if it doesn't exist
    const intBranch = team.integrationBranch;
    try {
      if (!this.workspaceManager.localBranchExists(repoRoot, intBranch)) {
        this.workspaceManager.runGit(repoRoot, ['branch', intBranch, team.baseBranch]);
      }
    } catch (e) {
      this.debugLog(`[Team] Integration branch creation: ${e.message}`);
    }

    // Merge each subtask branch into integration
    for (const taskId of team.subtaskIds) {
      const task = this.orchestrator.getTask(taskId);
      if (!task) continue;
      const branchName = task.branchName || `task/${taskId.slice(0, 8)}`;
      try {
        this.workspaceManager.runGit(repoRoot, ['checkout', intBranch]);
        this.workspaceManager.runGit(repoRoot, ['merge', '--no-edit', branchName]);
        this.debugLog(`[Team] Merged ${branchName} into ${intBranch}`);
      } catch (e) {
        this.teamStore.updateTeam(teamId, {
          status: 'failed',
          errorMessage: `Merge conflict: ${branchName} into ${intBranch}: ${e.message}`,
          completedAt: Date.now(),
        });
        // Abort the merge and restore
        try { this.workspaceManager.runGit(repoRoot, ['merge', '--abort']); } catch {}
        try { this.workspaceManager.runGit(repoRoot, ['checkout', team.baseBranch]); } catch {}
        this.emit('team:failed', this.teamStore.getTeam(teamId));
        this.emit('team:updated', this.teamStore.getTeam(teamId));
        return;
      }
    }

    // Restore original branch
    try { this.workspaceManager.runGit(repoRoot, ['checkout', team.baseBranch]); } catch {}

    this.teamStore.updateTeam(teamId, {
      status: 'completed',
      completedAt: Date.now(),
    });

    // Show report bubble on leader
    this.agentManager.updateAgent({
      registryId: team.leaderAgentId,
      state: 'done',
      reportTeamId: team.id,
    }, 'team');

    // Clear team membership from members
    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({
        registryId: memberId,
        teamId: null,
        teamName: null,
      }, 'team');
    }

    this.emit('team:completed', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
    this.debugLog(`[Team] Completed: ${teamId.slice(0, 8)} "${team.name}"`);
  }

  /**
   * Parse JSON subtask array from the leader's output text.
   * The TUI output can mangle whitespace, so we try multiple strategies.
   */
  _parseSubtasks(output) {
    if (!output) return null;

    // Strategy 1: find ```json ... ``` code block
    const codeBlockPatterns = [
      /```json\s*\n([\s\S]*?)\n\s*```/g,
      /```\s*\n([\s\S]*?)\n\s*```/g,
    ];
    for (const pattern of codeBlockPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const result = this._tryParseSubtaskJson(match[1]);
        if (result && result.length > 1) return result;
      }
    }

    // Strategy 2: find {"subtasks": [...]} — may span messy lines
    const objMatch = output.match(/\{[\s\S]*?"subtasks"\s*:\s*\[[\s\S]*?\]\s*\}/g);
    if (objMatch) {
      // Try each match, prefer the one with real assignee names (not template placeholders)
      for (const candidate of objMatch) {
        const result = this._tryParseSubtaskJson(candidate);
        if (result && result.length > 1 && !result[0]?.assignee?.includes('member name')) return result;
      }
    }

    // Strategy 3: scan for individual subtask objects and reconstruct
    const subtaskPattern = /"assignee"\s*:\s*"([^"]+)"[\s\S]*?"title"\s*:\s*"([^"]+)"[\s\S]*?"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const found = [];
    let m;
    while ((m = subtaskPattern.exec(output)) !== null) {
      if (m[1].includes('member name')) continue; // skip template
      found.push({
        assignee: m[1],
        title: m[2],
        prompt: m[3].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        dependsOn: [],
      });
    }
    if (found.length > 0) {
      this.debugLog(`[Team] Extracted ${found.length} subtasks via field scanning`);
      return found;
    }

    return null;
  }

  _tryParseSubtaskJson(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.subtasks && Array.isArray(parsed.subtasks)) return parsed.subtasks;
    } catch {}
    return null;
  }

  /**
   * Cancel a team and all its running tasks.
   */
  cancelTeam(teamId) {
    const team = this.teamStore.getTeam(teamId);
    if (!team) throw new Error('Team not found');

    // Cancel running tasks
    const allTaskIds = [team.planningTaskId, ...team.subtaskIds].filter(Boolean);
    for (const taskId of allTaskIds) {
      const task = this.orchestrator.getTask(taskId);
      if (task && !['succeeded', 'failed', 'cancelled'].includes(task.status)) {
        try { this.orchestrator.cancelTask(taskId); } catch {}
      }
    }

    // Clear team membership
    for (const memberId of team.memberAgentIds) {
      this.agentManager.updateAgent({
        registryId: memberId,
        teamId: null,
        teamName: null,
      }, 'team');
    }

    this.teamStore.updateTeam(teamId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    this.emit('team:cancelled', this.teamStore.getTeam(teamId));
    this.emit('team:updated', this.teamStore.getTeam(teamId));
    return this.teamStore.getTeam(teamId);
  }
}

module.exports = { TeamCoordinator };
