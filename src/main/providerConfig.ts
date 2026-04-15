/**
 * Runtime provider selection.
 */

const { getCodexSessionRoots } = require('./providers/codex/paths');
const { DEFAULT_PROVIDER, KNOWN_PROVIDERS } = require('./providers/registry');

function getDefaultEnabledProviders(env = process.env) {
  const providers = [DEFAULT_PROVIDER];
  if (getCodexSessionRoots({ env }).length > 0) {
    providers.push('codex');
  }
  return providers;
}

function getEnabledProviders(env = process.env) {
  const raw = (env.PIXEL_AGENT_PROVIDERS || env.PIXEL_AGENT_PROVIDER || '').trim().toLowerCase();
  if (!raw || raw === 'default') {
    return getDefaultEnabledProviders(env);
  }

  if (raw === 'all') {
    return [...KNOWN_PROVIDERS];
  }

  const selected = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => KNOWN_PROVIDERS.includes(value) && values.indexOf(value) === index);

  return selected.length > 0 ? selected : [DEFAULT_PROVIDER];
}

module.exports = { KNOWN_PROVIDERS, getDefaultEnabledProviders, getEnabledProviders };
