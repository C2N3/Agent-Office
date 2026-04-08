const fs = require('fs');
const os = require('os');
const path = require('path');

describe('AgentRegistry archived workspaces', () => {
  let tempHome;

  beforeEach(() => {
    jest.resetModules();
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-registry-'));
    jest.doMock('os', () => ({
      ...jest.requireActual('os'),
      homedir: () => tempHome,
    }));
  });

  afterEach(() => {
    jest.dontMock('os');
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  test('returns only archived workspace agents sorted by archivedAt desc', () => {
    const { AgentRegistry } = require('../src/main/agentRegistry');
    const registry = new AgentRegistry(() => {});

    const activeWorkspace = registry.createAgent({
      name: 'Active Workspace',
      projectPath: '/tmp/active',
      workspace: {
        repositoryPath: '/repo/a',
        worktreePath: '/tmp/active',
        branch: 'workspace/active',
      },
    });

    const archivedWorkspaceA = registry.createAgent({
      name: 'Archived A',
      projectPath: '/tmp/archived-a',
      workspace: {
        repositoryPath: '/repo/a',
        worktreePath: '/tmp/archived-a',
        branch: 'workspace/a',
      },
    });
    const archivedWorkspaceB = registry.createAgent({
      name: 'Archived B',
      projectPath: '/tmp/archived-b',
      workspace: {
        repositoryPath: '/repo/b',
        worktreePath: '/tmp/archived-b',
        branch: 'workspace/b',
      },
    });
    const archivedNonWorkspace = registry.createAgent({
      name: 'Archived Plain Agent',
      projectPath: '/tmp/plain',
    });

    registry.archiveAgent(archivedWorkspaceA.id);
    registry.archiveAgent(archivedWorkspaceB.id);
    registry.archiveAgent(archivedNonWorkspace.id);

    registry.updateAgent(archivedWorkspaceA.id, { name: 'Archived A Updated' });

    const workspaceA = registry.getAgent(archivedWorkspaceA.id);
    const workspaceB = registry.getAgent(archivedWorkspaceB.id);
    workspaceA.archivedAt = 100;
    workspaceB.archivedAt = 200;

    const archived = registry.getArchivedWorkspaceAgents();

    expect(activeWorkspace.archived).toBe(false);
    expect(archived.map((agent) => agent.id)).toEqual([
      archivedWorkspaceB.id,
      archivedWorkspaceA.id,
    ]);
    expect(archived.every((agent) => agent.archived && agent.workspace)).toBe(true);
  });
});
