export type DashboardProviderModel = {
  value: string;
  label: string;
};

export type DashboardProviderDefinition = {
  id: string;
  label: string;
  models: DashboardProviderModel[];
  buildTerminalBootCommand?: (sessionId?: string | null) => string;
};

export const DEFAULT_PROVIDER_ID = 'claude';

export const DASHBOARD_PROVIDER_DEFINITIONS: DashboardProviderDefinition[] = [
  {
    id: 'claude',
    label: 'Claude',
    models: [
      { value: '', label: 'Default' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    models: [
      { value: '', label: 'Default' },
      { value: 'o4-mini', label: 'o4-mini' },
      { value: 'o3', label: 'o3' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    buildTerminalBootCommand: (sessionId) => sessionId ? `codex resume ${sessionId}\r` : 'codex\r',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { value: '', label: 'Default' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
];

export function getProviderIds() {
  return DASHBOARD_PROVIDER_DEFINITIONS.map((provider) => provider.id);
}

export function getProviderDefinitions() {
  return DASHBOARD_PROVIDER_DEFINITIONS;
}

export function normalizeProvider(provider?: string | null, fallback = DEFAULT_PROVIDER_ID) {
  const candidate = String(provider || '').trim().toLowerCase();
  if (DASHBOARD_PROVIDER_DEFINITIONS.some((definition) => definition.id === candidate)) {
    return candidate;
  }
  return DASHBOARD_PROVIDER_DEFINITIONS.some((definition) => definition.id === fallback)
    ? fallback
    : DEFAULT_PROVIDER_ID;
}

export function getProviderDefinition(provider?: string | null) {
  const id = normalizeProvider(provider);
  return DASHBOARD_PROVIDER_DEFINITIONS.find((definition) => definition.id === id)!;
}

export function getProviderModels(provider?: string | null) {
  return getProviderDefinition(provider).models;
}

export function getTerminalBootCommand(provider?: string | null, sessionId?: string | null) {
  const definition = getProviderDefinition(provider);
  return definition.buildTerminalBootCommand ? definition.buildTerminalBootCommand(sessionId) : null;
}
