// @ts-nocheck
// -nocheck
/**
 * Runtime provider selection.
 */

const { getCodexSessionRoots } = require('./codexPaths');

const KNOWN_PROVIDERS = ['claude', 'codex'];

function getEnabledProviders(env = process.env) {
  const raw = (env.PIXEL_AGENT_PROVIDERS || env.PIXEL_AGENT_PROVIDER || '').trim().toLowerCase();
  if (!raw || raw === 'default') {
    return getCodexSessionRoots({ env }).length > 0 ? ['claude', 'codex'] : ['claude'];
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
