/**
 * Claude CLI Hook Registration
 * Read/write/register HTTP hooks from Claude CLI config file
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const HOOK_SERVER_PORT = 47821;

function getClaudeConfigPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function readClaudeConfig(debugLog) {
  try {
    const configPath = getClaudeConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    debugLog(`[Hook] Failed to read Claude config: ${error.message}`);
  }
  return {};
}

function writeClaudeConfig(config, debugLog) {
  try {
    const configPath = getClaudeConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    debugLog('[Hook] Claude config file updated');
    return true;
  } catch (error) {
    debugLog(`[Hook] Failed to write Claude config: ${error.message}`);
    return false;
  }
}

function hasOurHookInEntry(entry, hookUrl) {
  return entry.hooks && entry.hooks.some(h => h.type === 'http' && h.url === hookUrl);
}

function isHookRegistered(debugLog) {
  const config = readClaudeConfig(debugLog);
  const HTTP_HOOK_URL = `http://localhost:${HOOK_SERVER_PORT}/hook`;

  if (!config.hooks) {
    return false;
  }

  const hookEvents = ['SessionStart', 'PreToolUse', 'PostToolUse'];
  for (const event of hookEvents) {
    if (config.hooks[event] && Array.isArray(config.hooks[event])) {
      if (config.hooks[event].some(entry => hasOurHookInEntry(entry, HTTP_HOOK_URL))) {
        return true;
      }
    }
  }

  return false;
}

function registerClaudeHooks(debugLog) {
  debugLog('[Hook] Checking Claude CLI hook registration status...');

  if (isHookRegistered(debugLog)) {
    debugLog('[Hook] Hooks are already registered.');
    return true;
  }

  debugLog('[Hook] Starting hook registration...');

  const config = readClaudeConfig(debugLog);

  config.hooks = config.hooks || {};

  const HTTP_HOOK_URL = `http://localhost:${HOOK_SERVER_PORT}/hook`;
  const hookEvents = [
    'SessionStart', 'SessionEnd', 'UserPromptSubmit',
    'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
    'Stop', 'TaskCompleted', 'PermissionRequest', 'Notification',
    'SubagentStart', 'SubagentStop', 'TeammateIdle',
    'ConfigChange', 'WorktreeCreate', 'WorktreeRemove',
    'PreCompact'
  ];

  const ourEntry = {
    matcher: "*",
    hooks: [{ type: "http", url: HTTP_HOOK_URL }]
  };

  for (const event of hookEvents) {
    if (!Array.isArray(config.hooks[event])) {
      // 이벤트에 훅이 없으면 새로 생성
      config.hooks[event] = [ourEntry];
    } else if (!config.hooks[event].some(entry => hasOurHookInEntry(entry, HTTP_HOOK_URL))) {
      // 기존 훅 보존하고 우리 훅만 추가
      config.hooks[event].push(ourEntry);
    }
    // 이미 등록돼 있으면 건드리지 않음
  }

  if (writeClaudeConfig(config, debugLog)) {
    debugLog('[Hook] Claude CLI hook registration complete');
    return true;
  }

  debugLog('[Hook] Hook registration failed');
  return false;
}

module.exports = { HOOK_SERVER_PORT, registerClaudeHooks };
