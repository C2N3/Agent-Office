/**
 * hookRegistration.js Tests
 * Agent-Office no longer registers a global Claude hook. The module now
 * strips any previously-registered Agent-Office hook entries from
 * ~/.claude/settings.json as a migration step.
 */

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const os = require('os');

function loadModule() {
  const modulePath = require.resolve('../src/main/hookRegistration');
  delete require.cache[modulePath];
  return require('../src/main/hookRegistration');
}

const HOOK_URL = 'http://localhost:47821/hook';
const HOOK_URL_127 = 'http://127.0.0.1:47821/hook';
const CONFIG_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function buildConfigWithOurHook(events, url = HOOK_URL) {
  const hooks = {};
  for (const event of events) {
    hooks[event] = [{ matcher: '*', hooks: [{ type: 'http', url }] }];
  }
  return { hooks };
}

describe('hookRegistration', () => {
  let debugLog;

  beforeEach(() => {
    jest.clearAllMocks();
    debugLog = jest.fn();
  });

  describe('exports', () => {
    test('HOOK_SERVER_PORT is 47821', () => {
      const { HOOK_SERVER_PORT } = loadModule();
      expect(HOOK_SERVER_PORT).toBe(47821);
    });

    test('unregisterClaudeHooks is a function', () => {
      const { unregisterClaudeHooks } = loadModule();
      expect(typeof unregisterClaudeHooks).toBe('function');
    });
  });

  describe('unregisterClaudeHooks — no-op paths', () => {
    test('returns false when no config file exists', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(false);

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('returns false when config has no hooks key', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ someOtherKey: true }));

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('returns false when config contains only non-Agent-Office hooks', () => {
      const { unregisterClaudeHooks } = loadModule();
      const userHook = { matcher: '*', hooks: [{ type: 'http', url: 'http://localhost:9999/hook' }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ hooks: { SessionStart: [userHook] } }));

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('handles malformed JSON gracefully', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json }');

      expect(() => unregisterClaudeHooks(debugLog)).not.toThrow();
    });

    test('handles readFileSync errors gracefully', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Read error'); });

      expect(() => unregisterClaudeHooks(debugLog)).not.toThrow();
    });
  });

  describe('unregisterClaudeHooks — strip paths', () => {
    function captureWrittenConfig() {
      let written = null;
      fs.writeFileSync.mockImplementation((filePath, content) => {
        if (filePath === CONFIG_PATH) written = JSON.parse(content);
      });
      return () => written;
    }

    test('removes our hook entries and returns true', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(buildConfigWithOurHook(['SessionStart', 'PreToolUse'])));
      const getWritten = captureWrittenConfig();

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(true);
      const config = getWritten();
      expect(config.hooks).toBeUndefined();
    });

    test('also removes 127.0.0.1 variant of our hook URL', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(buildConfigWithOurHook(['SessionStart'], HOOK_URL_127)));
      const getWritten = captureWrittenConfig();

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(true);
      const config = getWritten();
      expect(config.hooks).toBeUndefined();
    });

    test('preserves unrelated user hooks', () => {
      const { unregisterClaudeHooks } = loadModule();
      const userHook = { matcher: '*', hooks: [{ type: 'http', url: 'http://localhost:9999/hook' }] };
      const ourHook = { matcher: '*', hooks: [{ type: 'http', url: HOOK_URL }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        hooks: { SessionStart: [userHook, ourHook], PreToolUse: [ourHook] },
      }));
      const getWritten = captureWrittenConfig();

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(true);
      const config = getWritten();
      expect(config.hooks.SessionStart).toHaveLength(1);
      expect(config.hooks.SessionStart[0].hooks[0].url).toBe('http://localhost:9999/hook');
      expect(config.hooks.PreToolUse).toBeUndefined();
    });

    test('drops only our hook when an entry has both our hook and others', () => {
      const { unregisterClaudeHooks } = loadModule();
      const mixedEntry = {
        matcher: '*',
        hooks: [
          { type: 'http', url: HOOK_URL },
          { type: 'http', url: 'http://localhost:9999/hook' },
        ],
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ hooks: { SessionStart: [mixedEntry] } }));
      const getWritten = captureWrittenConfig();

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(true);
      const config = getWritten();
      expect(config.hooks.SessionStart).toHaveLength(1);
      expect(config.hooks.SessionStart[0].hooks).toHaveLength(1);
      expect(config.hooks.SessionStart[0].hooks[0].url).toBe('http://localhost:9999/hook');
    });

    test('returns false and swallows error when writeFileSync throws', () => {
      const { unregisterClaudeHooks } = loadModule();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(buildConfigWithOurHook(['SessionStart'])));
      fs.writeFileSync.mockImplementation(() => { throw new Error('Permission denied'); });

      const result = unregisterClaudeHooks(debugLog);

      expect(result).toBe(false);
      expect(debugLog).toHaveBeenCalledWith(expect.stringMatching(/failed/i));
    });
  });
});
