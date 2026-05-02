jest.mock('tree-kill', () => jest.fn((_pid, _signal, callback) => callback && callback()));

const treeKill = require('tree-kill');
import { terminateAgentSession } from '../src/main/sessionTermination';

describe('agent session termination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cancels active task, destroys terminal, kills session pid, and offlines registered agent', async () => {
    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'registry-1',
        registryId: 'registry-1',
        isRegistered: true,
        state: 'Working',
        sessionId: 'thread-1',
      })),
      transitionToOffline: jest.fn(() => true),
    };
    const agentRegistry = {
      unlinkSession: jest.fn(),
    };
    const sessionPids = new Map([['thread-1', 12345]]);
    const terminalManager = {
      hasTerminal: jest.fn(() => true),
      destroyTerminal: jest.fn(),
    };
    const orchestrator = {
      getAllTasks: jest.fn(() => [
        { id: 'task-1', agentRegistryId: 'registry-1', status: 'running' },
        { id: 'task-2', agentRegistryId: 'registry-1', status: 'succeeded' },
      ]),
      cancelTask: jest.fn(),
    };

    const result = await terminateAgentSession({
      agentId: 'registry-1',
      agentManager,
      agentRegistry,
      sessionPids,
      terminalManager,
      orchestrator,
      debugLog: jest.fn(),
    });

    expect(result.success).toBe(true);
    expect(orchestrator.cancelTask).toHaveBeenCalledWith('task-1');
    expect(orchestrator.cancelTask).not.toHaveBeenCalledWith('task-2');
    expect(terminalManager.destroyTerminal).toHaveBeenCalledWith('registry-1');
    expect(treeKill).toHaveBeenCalledWith(12345, 'SIGTERM', expect.any(Function));
    expect(sessionPids.has('thread-1')).toBe(false);
    expect(agentRegistry.unlinkSession).toHaveBeenCalledWith('registry-1');
    expect(agentManager.transitionToOffline).toHaveBeenCalledWith('registry-1');
  });

  test('removes ephemeral agents after killing their session pid', async () => {
    const agentManager = {
      getAgent: jest.fn(() => ({
        id: 'session-1',
        isRegistered: false,
        state: 'Thinking',
        sessionId: 'session-1',
      })),
      removeAgent: jest.fn(() => true),
    };
    const sessionPids = new Map([['session-1', 54321]]);

    const result = await terminateAgentSession({
      agentId: 'session-1',
      agentManager,
      agentRegistry: null,
      sessionPids,
      terminalManager: null,
      orchestrator: null,
      debugLog: jest.fn(),
    });

    expect(result.success).toBe(true);
    expect(treeKill).toHaveBeenCalledWith(54321, 'SIGTERM', expect.any(Function));
    expect(agentManager.removeAgent).toHaveBeenCalledWith('session-1');
  });
});
