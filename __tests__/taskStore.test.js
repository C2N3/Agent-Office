const fs = require('fs');
const os = require('os');
const path = require('path');

describe('TaskStore', () => {
  let tempDir;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-task-store-'));
    jest.doMock('os', () => ({
      ...jest.requireActual('os'),
      homedir: () => tempDir,
    }));
  });

  afterEach(() => {
    jest.dontMock('os');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('marks in-flight persisted tasks as failed on load', () => {
    const persistDir = path.join(tempDir, '.agent-office');
    fs.mkdirSync(persistDir, { recursive: true });
    fs.writeFileSync(path.join(persistDir, 'task-queue.json'), JSON.stringify({
      version: 1,
      tasks: [
        {
          id: 'task-running',
          title: 'Running',
          prompt: 'run',
          provider: 'codex',
          status: 'running',
          updatedAt: 1,
          priority: 'normal',
        },
        {
          id: 'task-ready',
          title: 'Ready',
          prompt: 'ready',
          provider: 'codex',
          status: 'ready',
          updatedAt: 1,
          priority: 'normal',
        },
      ],
    }));

    const { TaskStore } = require('../src/main/orchestrator/taskStore.ts');
    const store = new TaskStore(jest.fn());

    expect(store.getTask('task-running')).toEqual(expect.objectContaining({
      status: 'failed',
      errorMessage: expect.stringContaining('Agent-Office restarted'),
      terminalId: null,
    }));
    expect(store.getTask('task-ready')).toEqual(expect.objectContaining({
      status: 'ready',
    }));
  });
});
