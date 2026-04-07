/**
 * Runtime provider selection.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const KNOWN_PROVIDERS = ['claude', 'codex'];

function getEnabledProviders(env = process.env) {
  const raw = (env.PIXEL_AGENT_PROVIDERS || env.PIXEL_AGENT_PROVIDER || '').trim().toLowerCase();
  if (!raw || raw === 'default') {
    const codexSessionsPath = path.join(os.homedir(), '.codex', 'sessions');
    return fs.existsSync(codexSessionsPath) ? ['claude', 'codex'] : ['claude'];
  }

  if (raw === 'all') {
    return [...KNOWN_PROVIDERS];
  }

  const selected = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => KNOWN_PROVIDERS.includes(value) && values.indexOf(value) === index);

  return selected.length > 0 ? selected : ['claude'];
}

module.exports = { KNOWN_PROVIDERS, getEnabledProviders };
