/**
 * Claude CLI Hook Unregistration (install-time)
 *
 * Agent-Office no longer registers a global Claude hook. Task-launched
 * CLI sessions are detected directly via orchestrator stream-json output
 * and a session allowlist. This script exists to migrate installs that
 * previously registered the global hook by stripping the Agent-Office
 * hook entries from ~/.claude/settings.json.
 *
 * This JS copy is used by src/install.js during postinstall (before
 * TypeScript sources are built into dist/).
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
  return null;
}

function writeClaudeConfig(config, debugLog) {
  try {
    const configPath = getClaudeConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    debugLog(`[Hook] Failed to write Claude config: ${error.message}`);
    return false;
  }
}

function isOurHookUrl(url) {
  if (typeof url !== 'string') return false;
  return url.includes(`127.0.0.1:${HOOK_SERVER_PORT}/hook`)
    || url.includes(`localhost:${HOOK_SERVER_PORT}/hook`);
}

/**
 * Strip Agent-Office hook entries from ~/.claude/settings.json.
 * Returns true if any changes were made.
 */
function unregisterClaudeHooks(debugLog) {
  const config = readClaudeConfig(debugLog);
  if (!config || !config.hooks || typeof config.hooks !== 'object') return false;

  let changed = false;
  for (const eventName of Object.keys(config.hooks)) {
    const entries = config.hooks[eventName];
    if (!Array.isArray(entries)) continue;

    const filteredEntries = [];
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.hooks)) {
        filteredEntries.push(entry);
        continue;
      }
      const remainingHooks = entry.hooks.filter((h) => !(h && h.type === 'http' && isOurHookUrl(h.url)));
      if (remainingHooks.length === entry.hooks.length) {
        filteredEntries.push(entry);
        continue;
      }
      changed = true;
      if (remainingHooks.length > 0) {
        filteredEntries.push({ ...entry, hooks: remainingHooks });
      }
      // else: drop the entry entirely if it held only our hook
    }

    if (filteredEntries.length === 0) {
      delete config.hooks[eventName];
    } else {
      config.hooks[eventName] = filteredEntries;
    }
  }

  if (!changed) return false;

  if (Object.keys(config.hooks).length === 0) {
    delete config.hooks;
  }

  if (writeClaudeConfig(config, debugLog)) {
    debugLog('[Hook] Removed Agent-Office hook entries from Claude config');
    return true;
  }
  return false;
}

module.exports = { HOOK_SERVER_PORT, unregisterClaudeHooks };
